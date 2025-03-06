import { NextResponse } from "next/server";
import db from "../../../firebase/db";
import { doc, updateDoc, arrayUnion, arrayRemove, collection, getDocs, query, where } from "firebase/firestore";

// GET: 指定月の休み情報を集約して取得
export async function GET(request: Request) {
  // URL のクエリパラメータから month を取得（例: ?month=2025-03）
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  if (!month) {
    return NextResponse.json({ error: "month パラメータが必要です" }, { status: 400 });
  }
  
  // 全スタッフのドキュメントを取得し、対象月に該当する日付を抽出
  const staffSnapshot = await getDocs(collection(db, "staff"));
  const result: { [date: string]: string[] } = {};
  
  staffSnapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.holidays && Array.isArray(data.holidays)) {
      data.holidays.forEach((date: string) => {
        // 日付が指定月で始まっているかチェック（例: "2025-03"）
        if (date.startsWith(month)) {
          if (!result[date]) {
            result[date] = [];
          }
          result[date].push(docSnap.id);
        }
      });
    }
  });
  
  return NextResponse.json(result);
}

// POST: 休み情報の登録（既存の実装）
export async function POST(request: Request) {
  const { month, holidays } = await request.json();
  // holidays: [{ date, staff: string[] }, ...]
  for (const entry of holidays) {
    const { date, staff } = entry;
    for (const staffId of staff) {
      if (staffId) {
        const staffRef = doc(db, "staff", staffId);
        await updateDoc(staffRef, { holidays: arrayUnion(date) });
      }
    }
  }
  return NextResponse.json({ message: "Holiday data updated" });
}
