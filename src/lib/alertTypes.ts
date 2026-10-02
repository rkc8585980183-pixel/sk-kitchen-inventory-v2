export interface QtyAlert {
  departmentId: string;
  departmentName: string;
  /** the entry (inventory_periods row) of the alert date */
  periodId: string;
  status: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  /** the item's last closing before this one, and when it was */
  previous: number;
  previousDate: string;
  direction: "up" | "down";
}

export function ratioText(a: Pick<QtyAlert, "quantity" | "previous" | "direction">): string {
  if (a.direction === "down") {
    return a.quantity === 0 ? "dropped to 0" : `${Math.round((a.previous / a.quantity) * 10) / 10}× lower`;
  }
  return `${Math.round((a.quantity / a.previous) * 10) / 10}× higher`;
}
