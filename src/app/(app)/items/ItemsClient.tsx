    } finally {
      setErrors(errs);
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <PageHeader
        title="Item master"
        subtitle={`${initialItems.length} items`}
        actions={
          <>
            <Button icon="download" onClick={downloadTemplate}>Template</Button>
            <Button icon="file" onClick={exportItems}>Export</Button>
            <label className={cn(buttonCls("secondary"), "cursor-pointer", uploading && "pointer-events-none opacity-50")}>
              <Icon name="upload" size={16} /> {uploading ? "Uploading..." : "Bulk upload"}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} className="hidden" />
            </label>
            <Button variant="primary" icon="plus" onClick={() => setEditing({ item_code: "", item_name: "", category: "", unit: units[0] })}>
              Add item
            </Button>
          </>
        }
      />

      {summary && (
        <div className="mb-4">
          <Notice tone={errors.length ? "warning" : "success"} icon={errors.length ? "alert" : "check"}>
            <p className="font-medium">{summary}</p>
            {errors.length > 0 && (
              <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
                {errors.map((er, i) => (
                  <li key={i}>{er}</li>
                ))}
              </ul>
            )}
          </Notice>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className="relative max-w-sm">
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input placeholder="Search by code or name" value={search} onChange={(e) => setSearch(e.target.value)} className={cn(inputCls, "pl-9")} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-slate-50/70">
              <tr>
                <th className={th}>Code</th>
                <th className={th}>Name</th>
                <th className={th}>Category</th>
                <th className={th}>Unit</th>
                <th className={th}>Status</th>
                <th className={cn(th, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((i) => (
                <tr key={i.id} className="transition hover:bg-slate-50/60">
                  <td className={cn(td, "font-mono text-xs")}>{i.item_code}</td>
                  <td className={cn(td, "font-medium text-slate-900")}>{i.item_name}</td>
                  <td className={td}>{i.category || "—"}</td>
                  <td className={td}>{i.unit}</td>
                  <td className={td}>
                    <Badge tone={i.is_active ? "green" : "slate"} dot>{i.is_active ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className={cn(td, "space-x-1 text-right whitespace-nowrap")}>
                    <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEditing(i)}>Edit</Button>
                    {canDelete && (
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(i)}>
                        {i.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState icon="items" title="No items found">Try a different search or add a new item.</EmptyState>}
        </div>
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit item" : "Add item"}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={saveItem}>Save</Button>
          </>
        }
      >
        {editing && (
          <>
            <Field label="Item code">
              <input value={editing.item_code || ""} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, item_code: e.target.value })} className={inputCls} placeholder="ITM001" />
            </Field>
            <Field label="Item name">
              <input value={editing.item_name || ""} onChange={(e) => setEditing({ ...editing, item_name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Category">
              <input value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className={inputCls} placeholder="Optional" />
            </Field>
            <Field label="Unit">
              <select value={editing.unit || units[0]} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} className={selectCls}>
                {units.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </Field>
          </>
        )}
      </Modal>
    </div>
  );
}
