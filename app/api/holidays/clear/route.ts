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
    if (data.holidays && Array.isArray(data.holidays)) {
      // threshold より新しい日付のみ残す
      const newHolidays = data.holidays.filter((date: string) => date >= threshold);
      await updateDoc(doc(db, "staff", staffDoc.id), { holidays: newHolidays });
    }
  }
  return NextResponse.json({ message: "Old holiday data cleared" });
}
