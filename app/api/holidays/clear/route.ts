// app/api/holidays/clear/route.ts
import { NextResponse } from "next/server";
import db from "../../../../firebase/db";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";

export async function POST() {
  const staffSnapshot = await getDocs(collection(db, "staff"));
  // 2年前の日付を算出
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const threshold = twoYearsAgo.toISOString().split("T")[0]; // "YYYY-MM-DD"形式

  for (const staffDoc of staffSnapshot.docs) {
    const data = staffDoc.data();
    const updates: { [field: string]: string[] } = {};

    if (data.holidaysYukyu && Array.isArray(data.holidaysYukyu)) {
      updates.holidaysYukyu = data.holidaysYukyu.filter((date: string) => date >= threshold);
    }
    if (data.holidaysFurikyu && Array.isArray(data.holidaysFurikyu)) {
      updates.holidaysFurikyu = data.holidaysFurikyu.filter((date: string) => date >= threshold);
    }
    if (data.holidaysDaikyu && Array.isArray(data.holidaysDaikyu)) {
      updates.holidaysDaikyu = data.holidaysDaikyu.filter((date: string) => date >= threshold);
    }
    if (Object.keys(updates).length > 0) {
      await updateDoc(doc(db, "staff", staffDoc.id), updates);
    }
  }
  return NextResponse.json({ message: "Old holiday data cleared" });
}
