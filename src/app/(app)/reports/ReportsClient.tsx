"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, inputCls, Notice, PageHeader, selectCls, StatusBadge, td, th } from "@/components/ui";
import { cn } from "@/lib/utils";
import ClosingExports from "./ClosingExports";

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

const PAGE = 100;

export default function ReportsClient({
  departments,
  items,
  today,
  minDate,
  canExport,
  rows,
  limitedFrom,
}: {
  departments: { id: string; name: string; is_active?: boolean }[];
  items: { id: string; item_code: string; item_name: string; category: string | null; unit: string; is_active: boolean }[];
  today: string;
  minDate?: string;
  canExport: boolean;
  rows: Row[];
  limitedFrom: string | null;
}) {
  const [department, setDepartment] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [shown, setShown] = useState(PAGE);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((r) => r.items?.category || "Uncategorized")))],
    [rows]
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (!r.inventory_periods || !r.items) return false;
        return (
          (department === "all" || r.inventory_periods.departments?.name === department) &&
          (category === "all" || (r.items.category || "Uncategorized") === category) &&
          (status === "all" || r.inventory_periods.status === status) &&
          (!from || r.inventory_periods.week_start >= from) &&
          (!to || r.inventory_periods.week_end <= to)
        );
      }),
    [rows, department, category, status, from, to]
  );

  const tableRows = useMemo(
    () =>
      filtered.map((r) => ({
        Department: r.inventory_periods?.departments?.name || "-",
        Date:
          r.inventory_periods?.week_start === r.inventory_periods?.week_end
            ? r.inventory_periods?.week_start
            : `${r.inventory_periods?.week_start} - ${r.inventory_periods?.week_end}`,
        "Item Code": r.items?.item_code ?? "",
        "Item Name": r.items?.item_name ?? "",
        Category: r.items?.category || "-",
        Unit: r.items?.unit ?? "",
        Quantity: r.quantity,
        Status: r.inventory_periods?.status ?? "",
        "Inv Code": r.inventory_periods?.inv_code ?? "",
      })),
    [filtered]
  );

  // Heavy libraries are loaded only when an export button is clicked.
  async function exportExcel() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(tableRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, "inventory_report.xlsx");
  }

  async function exportCSV() {
    const XLSX = await import("xlsx");
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(tableRows));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPDF() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("SK Kitchen Inventory Report", 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [Object.keys(tableRows[0] || { "No data": "" })],
      body: tableRows.map((r) => Object.values(r).map((v) => v ?? "")),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [15, 23, 42] },
    });
    doc.save("inventory_report.pdf");
  }

  const reset = () => {
    setDepartment("all"); setCategory("all"); setStatus("all"); setFrom(""); setTo(""); setShown(PAGE);
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={`${filtered.length} records`}
        actions={
          canExport && (
          <>
            <Button icon="file" onClick={exportExcel} disabled={!tableRows.length}>Excel</Button>
            <Button icon="download" onClick={exportCSV} disabled={!tableRows.length}>CSV</Button>
            <Button icon="download" onClick={exportPDF} disabled={!tableRows.length}>PDF</Button>
          </>
          )
        }
      />

      {limitedFrom && (
        <div className="mb-4">
          <Notice tone="info" icon="lock">Showing entries from <b>{limitedFrom}</b> onwards (your entry-lock limit).</Notice>
        </div>
      )}

      {canExport && <ClosingExports departments={departments} items={items} today={today} minDate={minDate} />}

      <h2 className="mb-3 text-base font-semibold text-slate-900">All entries</h2>
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Field label="Department">
            <select value={department} onChange={(e) => { setDepartment(e.target.value); setShown(PAGE); }} className={selectCls}>
              <option value="all">All</option>
              {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <select value={category} onChange={(e) => { setCategory(e.target.value); setShown(PAGE); }} className={selectCls}>
              {categories.map((c) => <option key={c} value={c}>{c === "all" ? "All" : c}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => { setStatus(e.target.value); setShown(PAGE); }} className={selectCls}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="submitted">Submitted</option>
              <option value="unlocked">Unlocked</option>
            </select>
          </Field>
          <Field label="From"><input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setShown(PAGE); }} className={inputCls} /></Field>
          <Field label="To"><input type="date" value={to} onChange={(e) => { setTo(e.target.value); setShown(PAGE); }} className={inputCls} /></Field>
          <div className="flex items-end"><Button variant="ghost" onClick={reset} className="w-full">Reset filters</Button></div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50/70">
              <tr>{["Department", "Date", "Item Code", "Item Name", "Category", "Unit", "Quantity", "Status", "Inv Code"].map((h) => <th key={h} className={cn(th, h === "Quantity" && "text-right")}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableRows.slice(0, shown).map((r, i) => (
                <tr key={i} className="hover:bg-slate-50/60">
                  <td className={cn(td, "font-medium text-slate-900 whitespace-nowrap")}>{r.Department}</td>
                  <td className={cn(td, "whitespace-nowrap text-xs")}>{r.Date}</td>
                  <td className={cn(td, "font-mono text-xs")}>{r["Item Code"]}</td>
                  <td className={td}>{r["Item Name"]}</td>
                  <td className={td}>{r.Category}</td>
                  <td className={td}>{r.Unit}</td>
                  <td className={cn(td, "text-right font-medium tabular-nums text-slate-900")}>{r.Quantity}</td>
                  <td className={td}><StatusBadge status={r.Status} /></td>
                  <td className={cn(td, "text-xs")}>{r["Inv Code"]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tableRows.length === 0 && <EmptyState icon="reports" title="No records match these filters" />}
        </div>
        {tableRows.length > shown && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <Badge>Showing {shown} of {tableRows.length}</Badge>
            <Button size="sm" onClick={() => setShown((s) => s + PAGE)}>Show more</Button>
          </div>
        )}
      </Card>
      {rows.length >= 2000 && <p className="mt-3 text-xs text-slate-400">Showing the latest 2000 entries.</p>}
    </div>
  );
}
