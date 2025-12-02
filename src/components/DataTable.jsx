import React, { useState, useMemo } from "react";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function DataTable({
  columns = [],
  data = [],
  onDelete,
  onEdit,
  exportFilename = "export.csv",
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    let d = [...data];

    if (search) {
      const q = search.toLowerCase();
      d = d.filter((row) =>
        columns.some((c) =>
          String(row[c.key] ?? "")
            .toLowerCase()
            .includes(q)
        )
      );
    }

    if (sortKey) {
      d.sort((a, b) => {
        const va = a[sortKey];
        const vb = b[sortKey];
        if (va === vb) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;

        if (typeof va === "number") {
          return sortDir === "asc" ? va - vb : vb - va;
        }

        return sortDir === "asc"
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      });
    }

    return d;
  }, [data, search, sortKey, sortDir, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageData = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const exportCSV = () => {
    if (!data.length) return;
    const header = columns.map((c) => c.label).join(",");
    const rows = data.map((row) =>
      columns
        .map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    saveAs(blob, exportFilename);
  };

  const exportPDF = () => {
    const doc = new jsPDF();

    const tableColumn = columns.map((c) => c.label);
    const tableRows = filtered.map((row) =>
      columns.map((c) => row[c.key] ?? "")
    );

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
    });

    doc.save(exportFilename.replace(".csv", ".pdf"));
  };

  const printTable = () => {
    const win = window.open("", "_blank");
    win.document.write("<html><body>");
    win.document.write("<h3>Print Export</h3>");
    win.document.write("<table border='1' style='border-collapse:collapse;width:100%;'>");
    win.document.write("<thead><tr>");
    columns.forEach((c) => win.document.write(`<th>${c.label}</th>`));
    win.document.write("</tr></thead><tbody>");
    filtered.forEach((row) => {
      win.document.write("<tr>");
      columns.forEach((c) => win.document.write(`<td>${row[c.key] ?? ""}</td>`));
      win.document.write("</tr>");
    });
    win.document.write("</tbody></table></body></html>");
    win.print();
    win.close();
  };

  return (
    <div className="bg-white p-4 rounded-2xl shadow">
      <div className="flex justify-between mb-4">
        <input
          placeholder="Search..."
          className="border p-2 rounded"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />

        <div className="flex gap-2">
          <button className="px-3 py-1 bg-gray-100 rounded" onClick={exportCSV}>
            CSV
          </button>
          <button className="px-3 py-1 bg-gray-100 rounded" onClick={exportPDF}>
            PDF
          </button>
          <button className="px-3 py-1 bg-gray-100 rounded" onClick={printTable}>
            Print
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="p-2 text-left cursor-pointer"
                >
                  {col.label}
                  {sortKey === col.key && ` (${sortDir})`}
                </th>
              ))}

              {(onDelete || onEdit) && <th className="p-2">Actions</th>}
            </tr>
          </thead>

          <tbody>
            {pageData.map((row) => (
              <tr key={row.id} className="border-b">
                {columns.map((c) => (
                  <td key={c.key} className="p-2">
                    {row[c.key]}
                  </td>
                ))}

                {(onDelete || onEdit) && (
                  <td className="p-2 flex gap-2">
                    {onEdit && (
                      <button
                        className="px-2 py-1 bg-yellow-100 rounded"
                        onClick={() => onEdit(row)}
                      >
                        View
                      </button>
                    )}
                    {onDelete && (
                      <button
                        className="px-2 py-1 bg-red-200 rounded"
                        onClick={() => onDelete(row.id)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex justify-between text-sm">
        <span>Total {filtered.length} results</span>
        <div className="flex gap-2">
          <button
            className="px-2 py-1 bg-gray-100 rounded"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Prev
          </button>
          <span>Page {page}/{pages}</span>
          <button
            className="px-2 py-1 bg-gray-100 rounded"
            disabled={page === pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
