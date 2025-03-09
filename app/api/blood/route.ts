import { NextResponse } from "next/server";
import db from "../../../firebase/db";
import { collection, getDocs, doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

// GET: 当月の採血担当情報を取得（staff ドキュメントの bloodDates フィールドから）
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  if (!month) {
    return NextResponse.json({ error: "月が指定されていません" }, { status: 400 });
  }

  // 全スタッフを取得
  const snapshot = await getDocs(collection(db, "staff"));
  const results: { [date: string]: string[] } = {};

  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    // bloodDates フィールドを期待。なければ空配列とする
    if (data.bloodDates && Array.isArray(data.bloodDates)) {
      data.bloodDates.forEach((date: string) => {
        if (!results[date]) results[date] = [];
        results[date].push(docSnap.id); // または必要に応じてスタッフ名
      });
    }
  });
  return NextResponse.json(results);
}

// POST: 採血担当情報の更新
// リクエストボディは { month: "YYYY-MM", updates: [{ date, add: string[], remove: string[] }, ...] } の形式とする
export async function POST(request: Request) {
  const { month, updates } = await request.json();
  if (!month || !updates) {
    return NextResponse.json({ error: "月と更新情報が必要です" }, { status: 400 });
  }

  // updates 配列をループして、各日付ごとに、staff ドキュメントの bloodDates フィールドを更新
  for (const update of updates) {
    const { date, add, remove } = update;
    // add で渡された各スタッフ ID に対して、bloodDates に date を追加
    for (const staffId of add) {
      if (staffId) {
        const staffRef = doc(db, "staff", staffId);
        await updateDoc(staffRef, { bloodDates: arrayUnion(date) });
      }
    }
    // remove で渡された各スタッフ ID に対して、bloodDates から date を削除
    for (const staffId of remove) {
      if (staffId) {
        const staffRef = doc(db, "staff", staffId);
        await updateDoc(staffRef, { bloodDates: arrayRemove(date) });
      }
    }
  }
  return NextResponse.json({ message: "採血担当情報が更新されました" });
}
