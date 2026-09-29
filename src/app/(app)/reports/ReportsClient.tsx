"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Row {
  quantity: number;
  items: { item_code: string; item_name: string; category: string | null; unit: string } | null;
  inventory_periods: {
    inv_code: string;
    week_start: string;
    week_end: string;
    status: string;
    departments: { name: string } | null;
  } | null;
}

export default function ReportsClient({
  departments,
  items,
  rows,
}: {
  departments: { id: string; name: string }[];
  items: { id: string; item_code: string; item_name: string; category: string | null }[];
  rows: Row[];
}) {
  const [department, setDepartment] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(items.map((i) => i.category || "Uncategorized")))],
    [items]
  );

  const filtered = rows.filter((r) => {
    if (!r.inventory_periods || !r.items) return false;
    const deptOk = department === "all" || r.inventory_periods.departments?.name === department;
    const catOk = category === "all" || (r.items.category || "Uncategorized") === category;
    const statusOk = status === "all" || r.inventory_periods.status === status;
    const fromOk = !from || r.inventory_periods.week_start >= from;
    const toOk = !to || r.inventory_periods.week_end <= to;
    return deptOk && catOk && statusOk && fromOk && toOk;
  });

  const tableRows = filtered.map((r) => ({
    Department: r.inventory_periods?.departments?.name || "-",
    Week: `${r.inventory_periods?.week_start} - ${r.inventory_periods?.week_end}`,
    "Item Code": r.items?.item_code,
    "Item Name": r.items?.item_name,
    Category: r.items?.category || "-",
    Unit: r.items?.unit,
    Quantity: r.quantity,
    Status: r.inventory_periods?.status,
    "Inv Code": r.inventory_periods?.inv_code,
  }));

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(tableRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, "inventory_report.xlsx");
  }

  function exportCSV() {
    const ws = XLSX.utils.json_to_sheet(tableRows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.text("SK Kitchen Inventory Report", 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [Object.keys(tableRows[0] || { "No data": "" })],
      body: tableRows.map((r) => Object.values(r).map((v) => v ?? "")),
      styles: { fontSize: 7 },
    });
    doc.save("inventory_report.pdf");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500">{filtered.length} records</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Department</label>
          <select value={department} onChange={(e) => setDepartment(e.target.value)} className="border border-gray-300 rounded-lg text-sm px-3 py-2">
            <option value="all">All</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-gray-300 rounded-lg text-sm px-3 py-2">
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-gray-300 rounded-lg text-sm px-3 py-2">
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="submitted">Submitted</option>
            <option value="unlocked">Unlocked</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-gray-300 rounded-lg text-sm px-3 py-2" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-gray-300 rounded-lg text-sm px-3 py-2" />
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={exportExcel} className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
            Excel
          </button>
          <button onClick={exportCSV} className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
            CSV
          </button>
          <button onClick={exportPDF} className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
            PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              {["Department", "Week", "Item Code", "Item Name", "Category", "Unit", "Quantity", "Status", "Inv Code"].map((h) => (
                <th key={h} className="px-4 py-2 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r, idx) => (
              <tr key={idx} className="border-b border-gray-50 last:border-0">
                {Object.values(r).map((v, i) => (
                  <td key={i} className="px-4 py-2 text-gray-600 whitespace-nowrap">
                    {String(v)}
                  </td>
                ))}
              </tr>
            ))}
            {tableRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-400">
                  No records match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
