// app/api/nightEdit/route.ts
import { NextResponse } from "next/server";
import db from "../../../firebase/db";
import { collection, getDocs } from "firebase/firestore";

// シフトフィールドとして扱うキーのリテラル型
type ShiftType = "宿直" | "二交代" | "日直主" | "日直副";
// 対象のシフトフィールドを明示的に指定した配列
const shiftTypes: ShiftType[] = ["宿直", "二交代", "日直主", "日直副"];

// 各日付ごとのシフト情報の型
interface ShiftDataEntry {
  宿直: string[];
  二交代: string[];
  日直主: string[];
  日直副: string[];
}
// API のレスポンスとして返すシフトデータの型
interface ShiftData {
  [date: string]: ShiftDataEntry;
}

export async function GET(request: Request) {
  // クエリパラメータから対象月を取得（例："2025-04"）
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");

  // 結果を保持するオブジェクトの初期化
  const shiftData: ShiftData = {};

  try {
    // staff コレクションの全ドキュメントを取得
    const staffSnapshot = await getDocs(collection(db, "staff"));

    staffSnapshot.forEach((doc) => {
      const data = doc.data();
      const staffId = doc.id;
      // 各シフトフィールドについてループ
      shiftTypes.forEach((shiftType) => {
        const dates = data[shiftType];
        // dates が配列であることを確認
        if (Array.isArray(dates)) {
          dates.forEach((dateValue: string) => {
            // 例: dateValue は "2025-04-22" のような文字列であることを想定
            // クエリパラメータ month がある場合は、対象月以外はスキップ
            if (month && !dateValue.startsWith(month)) {
              return;
            }
            // 対象の日付キーがまだなければ初期化
            if (!shiftData[dateValue]) {
              shiftData[dateValue] = {
                宿直: [],
                二交代: [],
                日直主: [],
                日直副: [],
              };
            }
            // 重複しないようにスタッフIDを追加
            if (!shiftData[dateValue][shiftType].includes(staffId)) {
              shiftData[dateValue][shiftType].push(staffId);
            }
          });
        }
      });
    });

    // JSON としてレスポンスを返す
    return NextResponse.json(shiftData);
  } catch (error) {
    console.error("夜勤シフトデータ取得エラー:", error);
    return NextResponse.json(
      { error: "シフトデータの取得に失敗しました" },
      { status: 500 }
    );
  }
}
