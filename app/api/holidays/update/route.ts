import { NextResponse } from "next/server";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import db from "@/firebase/db";

export async function POST(request: Request) {
  const { month, updates } = await request.json();
  // updates: [{ date, add: string[], remove: string[] }, ...]
  for (const update of updates) {
    const { date, add, remove } = update;
    for (const staffId of add) {
      if (staffId) {
        const staffRef = doc(db, "staff", staffId);
        await updateDoc(staffRef, { holidays: arrayUnion(date) });
      }
    }
    for (const staffId of remove) {
      if (staffId) {
        const staffRef = doc(db, "staff", staffId);
        await updateDoc(staffRef, { holidays: arrayRemove(date) });
      }
    }
  }
  return NextResponse.json({ message: "Holiday data updated" });
}
