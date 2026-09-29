"use client";

import { useRouter } from "next/navigation";

export default function DepartmentPicker({
  departments,
  selected,
}: {
  departments: { id: string; name: string }[];
  selected: string;
}) {
  const router = useRouter();
  return (
    <select
      value={selected}
      onChange={(e) => router.push(`/inventory?department=${e.target.value}`)}
      className="border border-gray-300 rounded-lg text-sm px-3 py-2"
    >
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );
}
