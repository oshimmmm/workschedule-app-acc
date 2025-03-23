// app/api/nightEdit/clear/route.ts
import { NextResponse } from "next/server";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import db from "@/firebase/db";

interface RequestBody {
  month: string;
}

type ShiftType = "待機" | "二交代" | "日直主" | "日直副";
// 対象のシフトフィールドを明示的に指定
const shiftTypes: ShiftType[] = ["待機", "二交代", "日直主", "日直副"];

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json();
    const { month } = body;
    if (!month) {
      return NextResponse.json({ error: "月情報が必要です" }, { status: 400 });
    }
    
    // staff コレクションの全ドキュメントを取得
    const staffSnapshot = await getDocs(collection(db, "staff"));
    const updatePromises: Promise<any>[] = [];
    
    staffSnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      const docRef = doc(db, "staff", docSnapshot.id);
      // 更新用オブジェクトを準備
      const updates: Partial<Record<ShiftType, string[]>> = {};
      
      shiftTypes.forEach((shiftType) => {
        // 各フィールドが配列かどうか確認
        const dates: string[] = Array.isArray(data[shiftType]) ? data[shiftType] : [];
        // 送られてきた月で始まる日付を除外した新しい配列を作成
        const filteredDates = dates.filter((dateValue) => !dateValue.startsWith(month));
        // 除外する日付があれば更新対象にする
        if (filteredDates.length !== dates.length) {
          updates[shiftType] = filteredDates;
        }
      });
      
      // 1つでも更新があれば updateDoc を実行
      if (Object.keys(updates).length > 0) {
        updatePromises.push(updateDoc(docRef, updates));
      }
    });
    
    await Promise.all(updatePromises);
    return NextResponse.json({ message: `${month} の夜勤シフトデータがクリアされました` });
  } catch (error) {
    console.error("夜勤シフトデータクリアエラー:", error);
    return NextResponse.json(
      { error: "夜勤シフトデータのクリアに失敗しました" },
      { status: 500 }
    );
  }
}
