import unittest
from unittest.mock import patch

import pandas as pd

from cyberpulse.backend import main


class MuleTrackerGraphTests(unittest.TestCase):
    def test_falls_back_to_csv_graph_when_neo4j_is_unavailable(self):
        transactions = pd.DataFrame(
            [
                {
                    "user_id": "U1",
                    "beneficiary_id": "B1",
                    "amount": 1500.0,
                    "beneficiary_is_new": True,
                    "timestamp": "2024-01-01T12:00:00",
                },
                {
                    "user_id": "U2",
                    "beneficiary_id": "B1",
                    "amount": 900.0,
                    "beneficiary_is_new": False,
                    "timestamp": "2024-01-01T13:00:00",
                },
            ]
        )
        alerts = pd.DataFrame([{"user_id": "U1", "risk_score": 80.0}])

        with patch.object(main, "_load_mule_graph_from_neo4j", return_value=None):
            result = main.build_mule_tracker_graph(transactions, alerts)

        self.assertGreaterEqual(len(result["nodes"]), 2)
        self.assertGreaterEqual(len(result["links"]), 1)


if __name__ == "__main__":
    unittest.main()
