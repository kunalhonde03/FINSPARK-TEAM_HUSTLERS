import { useMemo, useState } from "react";

function csvDownload(filename, rows) {
  const csv = [Object.keys(rows[0]).join(","), ...rows.map((r) => Object.values(r).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function InventoryTable({ inventory }) {
  const [filter, setFilter] = useState("");

  const sections = useMemo(() => {
    if (!inventory) return [];
    return [
      { key: "tls_versions", title: "TLS versions", data: inventory.tls_versions || {} },
      { key: "cipher_suites", title: "Cipher suites", data: inventory.cipher_suites || {} },
      { key: "cert_key_length_buckets", title: "Certificate key-length buckets", data: inventory.cert_key_length_buckets || {} },
      { key: "cert_signature_algorithms", title: "Certificate signature algorithms", data: inventory.cert_signature_algorithms || {} },
      { key: "alerts_by_quantum_risk", title: "Alerts by quantum risk", data: inventory.alerts_by_quantum_risk || {} },
    ];
  }, [inventory]);

  const filteredSections = sections.map((section) => ({
    ...section,
    rows: Object.entries(section.data || {})
      .map(([name, value]) => ({ name, value }))
      .filter((r) => r.name.toLowerCase().includes(filter.toLowerCase())),
  }));

  function handleExport() {
    const rows = [];
    filteredSections.forEach((s) => {
      s.rows.forEach((r) => {
        rows.push({ section: s.title, key: r.name, count: r.value });
      });
    });
    if (rows.length === 0) return;
    csvDownload("crypto-inventory.csv", rows);
  }

  return (
    <div className="soc-panel p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="soc-label">Inventory</div>
          <div className="mt-1 text-sm text-muted">Detailed counts by crypto attribute</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            placeholder="Filter entries"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border border-border bg-panelSoft px-2 py-1 text-sm text-text"
          />
          <button type="button" className="soc-button" onClick={handleExport}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-4 max-h-[420px] overflow-auto">
        {filteredSections.map((section) => (
          <div key={section.key}>
            <div className="text-sm font-semibold text-text">{section.title}</div>
            <div className="mt-2">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="pb-2 text-muted">Name</th>
                    <th className="pb-2 text-muted">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={row.name} className="border-t border-border">
                      <td className="py-2">{row.name}</td>
                      <td className="py-2 font-mono">{row.value}</td>
                    </tr>
                  ))}
                  {section.rows.length === 0 && (
                    <tr>
                      <td className="py-2 text-muted" colSpan={2}>
                        No entries
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
