import { NextResponse } from "next/server";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import db from "@/firebase/db";

interface HolidayUpdate {
  date: string;
  addYukyu: string[];
  removeYukyu: string[];
  addFurikyu: string[];
  removeFurikyu: string[];
  addDaikyu: string[];
  removeDaikyu: string[];
}

export async function POST(request: Request) {
  const { month, updates } = await request.json();
  if (!month || !updates) {
    return NextResponse.json({ error: "月と更新情報が必要です" }, { status: 400 });
  }

  // 各更新情報について、対象スタッフドキュメントの各休みフィールドを更新
  for (const update of updates as HolidayUpdate[]) {
    const { date, addYukyu, removeYukyu, addFurikyu, removeFurikyu, addDaikyu, removeDaikyu } = update;
    // 有休の更新
    for (const staffId of addYukyu) {
      if (staffId) {
        const staffRef = doc(db, "staff", staffId);
        await updateDoc(staffRef, { holidaysYukyu: arrayUnion(date) });
      }
    }
    for (const staffId of removeYukyu) {
      if (staffId) {
        const staffRef = doc(db, "staff", staffId);
        await updateDoc(staffRef, { holidaysYukyu: arrayRemove(date) });
      }
    }
    // 振休の更新
    for (const staffId of addFurikyu) {
      if (staffId) {
        const staffRef = doc(db, "staff", staffId);
        await updateDoc(staffRef, { holidaysFurikyu: arrayUnion(date) });
      }
    }
    for (const staffId of removeFurikyu) {
      if (staffId) {
        const staffRef = doc(db, "staff", staffId);
        await updateDoc(staffRef, { holidaysFurikyu: arrayRemove(date) });
      }
    }
    // 代休の更新
    for (const staffId of addDaikyu) {
      if (staffId) {
        const staffRef = doc(db, "staff", staffId);
        await updateDoc(staffRef, { holidaysDaikyu: arrayUnion(date) });
      }
    }
    for (const staffId of removeDaikyu) {
      if (staffId) {
        const staffRef = doc(db, "staff", staffId);
        await updateDoc(staffRef, { holidaysDaikyu: arrayRemove(date) });
      }
    }
  }
  return NextResponse.json({ message: "Holiday data updated" });
}
