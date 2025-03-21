// app/api/nightEdit/route.ts
import { NextResponse } from "next/server";
import db from "../../../firebase/db";
import { collection, getDocs } from "firebase/firestore";

// GETリクエストで staff コレクションの各ドキュメントから
// 「待機」「二交代」「日直主」「日直副」の各フィールドを集計し、
// 各日付ごとにどのスタッフが割り当てられているかのマッピングを作成して返す

export async function GET() {
  // Firestoreの staff コレクションからすべてのドキュメントを取得
  const staffSnapshot = await getDocs(collection(db, "staff"));

  // 結果の型：各フィールドごとに、キーが日付、値がスタッフ名の配列
  const result: Record<string, Record<string, string[]>> = {
    待機: {},
    二交代: {},
    日直主: {},
    日直副: {},
  };

  staffSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    const staffName = data.name;
    // 対象フィールドをループ
    ["待機", "二交代", "日直主", "日直副"].forEach((field) => {
      // もしフィールドが存在しなければスキップ
      const dates: string[] = data[field] || [];
      dates.forEach((dateStr) => {
        if (!result[field][dateStr]) {
          result[field][dateStr] = [];
        }
        result[field][dateStr].push(staffName);
      });
    });
  });

  return NextResponse.json(result);
}
