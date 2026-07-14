"""Neo4j data importer and schema builder for CyberPulse."""

import os
import sys
from pathlib import Path
import pandas as pd
from neo4j import GraphDatabase

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
ALERTS_PATH = DATA_DIR / "alerts_quantum.csv"
TELEMETRY_PATH = DATA_DIR / "telemetry.csv"
TRANSACTIONS_PATH = DATA_DIR / "transactions.csv"

def sync_data_to_neo4j(uri, username, password, database="neo4j"):
    """Syncs CSV telemetry and transactional data to a Neo4j database."""
    print(f"Connecting to Neo4j database '{database}' at {uri}...")
    
    # 1. Load CSV data
    if not (ALERTS_PATH.exists() and TELEMETRY_PATH.exists() and TRANSACTIONS_PATH.exists()):
        raise FileNotFoundError("Missing CyberPulse CSV data files. Run generator scripts first.")
        
    alerts_df = pd.read_csv(ALERTS_PATH)
    telemetry_df = pd.read_csv(TELEMETRY_PATH)
    txns_df = pd.read_csv(TRANSACTIONS_PATH)
    
    # Pre-process columns to avoid NaN in Neo4j
    alerts_df = alerts_df.fillna({
        "risk_score": 0.0,
        "quantum_risk_level": "Low",
        "quantum_risk_explanation": "",
        "explanation": "",
        "failed_login_count": 0,
        "device_change_flag": 0,
        "geo_velocity_flag": 0,
        "weak_crypto_flag": 0,
        "new_beneficiary_flag": 0
    })
    
    telemetry_df = telemetry_df.fillna({
        "login_status": "Success",
        "geo_location": "Unknown",
        "ip_address": "0.0.0.0",
        "device_fingerprint": "Unknown",
        "tls_version": "Unknown",
        "cipher_suite": "Unknown",
        "cert_key_length": 0,
        "cert_signature_alg": "Unknown",
        "auth_method": "Unknown"
    })
    
    txns_df = txns_df.fillna({
        "amount": 0.0,
        "channel": "Unknown",
        "beneficiary_is_new": 0,
        "merchant_category": "Unknown"
    })
    
    # Determine risk indicators
    high_risk_users = set(alerts_df[alerts_df["risk_score"] >= 70]["user_id"].unique())

    # 2. Establish Neo4j connection
    driver = GraphDatabase.driver(uri, auth=(username, password))
    
    try:
        with driver.session(database=database) as session:
            # Clear database
            print("Clearing existing nodes and relationships...")
            session.run("MATCH (n) DETACH DELETE n")
            
            # Create indexes / constraints
            print("Creating database constraints and indexes...")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (b:Beneficiary) REQUIRE b.id IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (s:Session) REQUIRE s.id IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (ip:IPAddress) REQUIRE ip.value IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (d:Device) REQUIRE d.id IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (t:Transaction) REQUIRE t.id IS UNIQUE")
            
            # Import Users
            print("Importing User nodes...")
            users_batch = []
            unique_users = set(alerts_df["user_id"].unique()).union(set(telemetry_df["user_id"].unique())).union(set(txns_df["user_id"].unique()))
            for user_id in unique_users:
                user_id_str = str(user_id)
                user_score_rows = alerts_df[alerts_df["user_id"] == user_id]
                max_score = float(user_score_rows["risk_score"].max()) if not user_score_rows.empty else 30.0
                users_batch.append({
                    "id": user_id_str,
                    "risk_score": max_score,
                    "risk_level": "High" if max_score >= 70 else "Medium" if max_score >= 50 else "Low",
                    "is_compromised": user_id_str in high_risk_users
                })
            
            session.run(
                """
                UNWIND $batch AS row
                MERGE (u:User {id: row.id})
                SET u.risk_score = row.risk_score,
                    u.risk_level = row.risk_level,
                    u.is_compromised = row.is_compromised
                """,
                batch=users_batch
            )
            
            # Import Beneficiaries
            print("Importing Beneficiary nodes...")
            beneficiaries = txns_df.groupby("beneficiary_id").agg({
                "amount": ["count", "sum"],
                "beneficiary_is_new": "first"
            })
            beneficiaries.columns = ["txn_count", "total_received", "is_new"]
            beneficiaries = beneficiaries.reset_index()
            
            beneficiaries_batch = []
            for _, row in beneficiaries.iterrows():
                benef_id = str(row["beneficiary_id"])
                # Compute mock risk score for beneficiaries based on compromised senders
                sending_users = txns_df[txns_df["beneficiary_id"] == benef_id]["user_id"].unique()
                compromised_count = sum(1 for u in sending_users if str(u) in high_risk_users)
                risk_val = "Low"
                risk_score = 25.0
                if compromised_count >= 2:
                    risk_val = "High"
                    risk_score = 90.0
                elif compromised_count == 1 or len(sending_users) >= 3:
                    risk_val = "Medium"
                    risk_score = 60.0
                    
                beneficiaries_batch.append({
                    "id": benef_id,
                    "txn_count": int(row["txn_count"]),
                    "total_received": float(row["total_received"]),
                    "is_new": bool(row["is_new"]),
                    "risk_level": risk_val,
                    "risk_score": risk_score
                })
                
            session.run(
                """
                UNWIND $batch AS row
                MERGE (b:Beneficiary {id: row.id})
                SET b.txn_count = row.txn_count,
                    b.total_received = row.total_received,
                    b.is_new = row.is_new,
                    b.risk_level = row.risk_level,
                    b.risk_score = row.risk_score
                """,
                batch=beneficiaries_batch
            )

            # Import Sessions
            print("Importing Session nodes...")
            sessions_batch = []
            for _, row in alerts_df.iterrows():
                sessions_batch.append({
                    "id": str(row["session_id"]),
                    "user_id": str(row["user_id"]),
                    "risk_score": float(row["risk_score"]),
                    "quantum_risk_level": str(row["quantum_risk_level"]),
                    "quantum_explanation": str(row["quantum_risk_explanation"]),
                    "explanation": str(row["explanation"]),
                    "start": str(row["session_start"]),
                    "end": str(row["session_end"]),
                    "failed_login_count": int(row["failed_login_count"]),
                    "device_changed": bool(row["device_change_flag"]),
                    "geo_velocity_flag": bool(row["geo_velocity_flag"]),
                    "weak_crypto_flag": bool(row["weak_crypto_flag"]),
                    "new_beneficiary_flag": bool(row["new_beneficiary_flag"])
                })
                
            session.run(
                """
                UNWIND $batch AS row
                MERGE (s:Session {id: row.id})
                SET s.risk_score = row.risk_score,
                    s.quantum_risk_level = row.quantum_risk_level,
                    s.quantum_explanation = row.quantum_explanation,
                    s.explanation = row.explanation,
                    s.start = row.start,
                    s.end = row.end,
                    s.failed_login_count = row.failed_login_count,
                    s.device_changed = row.device_changed,
                    s.geo_velocity_flag = row.geo_velocity_flag,
                    s.weak_crypto_flag = row.weak_crypto_flag,
                    s.new_beneficiary_flag = row.new_beneficiary_flag
                
                WITH s, row
                MATCH (u:User {id: row.user_id})
                MERGE (u)-[:INITIATED]->(s)
                """,
                batch=sessions_batch
            )

            # Import Transactions
            print("Importing Transaction nodes and linkages...")
            txns_batch = []
            for _, row in txns_df.iterrows():
                txns_batch.append({
                    "id": str(row["txn_id"]),
                    "user_id": str(row["user_id"]),
                    "beneficiary_id": str(row["beneficiary_id"]),
                    "amount": float(row["amount"]),
                    "channel": str(row["channel"]),
                    "merchant_category": str(row["merchant_category"]),
                    "timestamp": str(row["timestamp"])
                })
                
            session.run(
                """
                UNWIND $batch AS row
                MERGE (t:Transaction {id: row.id})
                SET t.amount = row.amount,
                    t.channel = row.channel,
                    t.merchant_category = row.merchant_category,
                    t.timestamp = row.timestamp
                
                WITH t, row
                MATCH (u:User {id: row.user_id})
                MATCH (b:Beneficiary {id: row.beneficiary_id})
                MERGE (u)-[:TRANSACTED]->(t)
                MERGE (t)-[:TO_BENEFICIARY]->(b)
                """,
                batch=txns_batch
            )

            # Associate Transactions to Sessions (link transactions happening during a session)
            print("Linking Transactions to Sessions based on timestamp windows...")
            session.run(
                """
                MATCH (u:User)-[:INITIATED]->(s:Session)
                MATCH (u)-[:TRANSACTED]->(t:Transaction)
                WHERE t.timestamp >= s.start AND t.timestamp <= s.end
                MERGE (s)-[:RECORDED_TRANSACTION]->(t)
                """
            )

            # Import IPs and Devices from telemetry
            print("Importing IP and Device telemetry nodes...")
            ips = telemetry_df["ip_address"].unique()
            ips_batch = [{"value": str(ip)} for ip in ips if pd.notna(ip) and str(ip) != "nan"]
            session.run(
                """
                UNWIND $batch AS row
                MERGE (ip:IPAddress {value: row.value})
                """,
                batch=ips_batch
            )
            
            devices = telemetry_df["device_fingerprint"].unique()
            devices_batch = [{"id": str(dev)} for dev in devices if pd.notna(dev) and str(dev) != "nan"]
            session.run(
                """
                UNWIND $batch AS row
                MERGE (d:Device {id: row.id})
                """,
                batch=devices_batch
            )

            # Associate IPs and Devices to Sessions based on user_id and timestamps
            print("Connecting Sessions to IPAddresses and Devices...")
            telemetry_batch = []
            for _, row in telemetry_df.iterrows():
                telemetry_batch.append({
                    "user_id": str(row["user_id"]),
                    "timestamp": str(row["timestamp"]),
                    "ip": str(row["ip_address"]),
                    "device": str(row["device_fingerprint"]),
                    "tls_version": str(row["tls_version"]),
                    "cipher_suite": str(row["cipher_suite"])
                })
            
            session.run(
                """
                UNWIND $batch AS row
                MATCH (u:User {id: row.user_id})-[:INITIATED]->(s:Session)
                WHERE row.timestamp >= s.start AND row.timestamp <= s.end
                
                WITH s, row
                MATCH (ip:IPAddress {value: row.ip})
                MATCH (d:Device {id: row.device})
                
                MERGE (s)-[c:CONNECTED_FROM]->(ip)
                ON CREATE SET c.tls_version = row.tls_version, c.cipher_suite = row.cipher_suite
                
                MERGE (s)-[u:USED_DEVICE]->(d)
                """,
                batch=telemetry_batch
            )

            print("Data synchronization complete!")
            
    finally:
        driver.close()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--uri", default="bolt://localhost:7687")
    parser.add_argument("--username", default="neo4j")
    parser.add_argument("--password", default="password")
    parser.add_argument("--database", default="neo4j")
    args = parser.parse_args()
    
    try:
        sync_data_to_neo4j(args.uri, args.username, args.password, args.database)
    except Exception as e:
        print(f"Error during synchronization: {e}")
        sys.exit(1)
