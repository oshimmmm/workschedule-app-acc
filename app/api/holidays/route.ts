import { NextResponse } from "next/server";
import db from "../../../firebase/db";
import { doc, updateDoc, arrayUnion, arrayRemove, collection, getDocs } from "firebase/firestore";

// GET: 指定月の休み情報を集約して取得（有休、振休、代休それぞれのフィールド）
export async function GET(request: Request) {
  // URL のクエリパラメータから month を取得（例: ?month=2025-05）
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  if (!month) {
    return NextResponse.json({ error: "month パラメータが必要です" }, { status: 400 });
  }
  
  // 全スタッフのドキュメントを取得
  const staffSnapshot = await getDocs(collection(db, "staff"));
  // 結果形式: { "YYYY-MM-DD": { yukyu: string[], furikyu: string[], daikyu: string[] } }
  const result: { [date: string]: { yukyu: string[]; furikyu: string[]; daikyu: string[] } } = {};
  
  staffSnapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    // 有休
    if (data.holidaysYukyu && Array.isArray(data.holidaysYukyu)) {
      data.holidaysYukyu.forEach((date: string) => {
        if (date.startsWith(month)) {
          if (!result[date]) result[date] = { yukyu: [], furikyu: [], daikyu: [] };
          result[date].yukyu.push(docSnap.id);
        }
      });
    }
    // 振休
    if (data.holidaysFurikyu && Array.isArray(data.holidaysFurikyu)) {
      data.holidaysFurikyu.forEach((date: string) => {
        if (date.startsWith(month)) {
          if (!result[date]) result[date] = { yukyu: [], furikyu: [], daikyu: [] };
          result[date].furikyu.push(docSnap.id);
        }
      });
    }
    // 代休
    if (data.holidaysDaikyu && Array.isArray(data.holidaysDaikyu)) {
      data.holidaysDaikyu.forEach((date: string) => {
        if (date.startsWith(month)) {
          if (!result[date]) result[date] = { yukyu: [], furikyu: [], daikyu: [] };
          result[date].daikyu.push(docSnap.id);
        }
      });
    }
  });
  
  return NextResponse.json(result);
}

// POST: 休み情報の登録・更新
// リクエストボディの形式例:
// {
//   month: "2025-05",
//   holidays: [
//     {
//       date: "2025-05-01",
//       yukyu: ["staffId1", "staffId3"],
//       furikyu: ["staffId2"],
//       daikyu: []
//     },
//     { ... }
//   ]
// }
export async function POST(request: Request) {
  const { month, holidays } = await request.json();
  if (!month || !holidays) {
    return NextResponse.json({ error: "月と更新情報が必要です" }, { status: 400 });
  }
  // holidays: [{ date, yukyu: string[], furikyu: string[], daikyu: string[] }, ...]
  for (const entry of holidays) {
    const { date, yukyu, furikyu, daikyu } = entry;
    // 有休の更新
    for (const staffId of yukyu) {
      if (staffId) {
        const staffRef = doc(db, "staff", staffId);
        await updateDoc(staffRef, { holidaysYukyu: arrayUnion(date) });
      }
    }
    // 振休の更新
    for (const staffId of furikyu) {
      if (staffId) {
        const staffRef = doc(db, "staff", staffId);
        await updateDoc(staffRef, { holidaysFurikyu: arrayUnion(date) });
      }
    }
    // 代休の更新
    for (const staffId of daikyu) {
      if (staffId) {
        const staffRef = doc(db, "staff", staffId);
        await updateDoc(staffRef, { holidaysDaikyu: arrayUnion(date) });
      }
    }
  }
  return NextResponse.json({ message: "Holiday data updated" });
}
