// app/api/nightEdit/update/route.ts
import { NextResponse } from "next/server";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import db from "@/firebase/db";

// シフトフィールドとして扱うキーのリテラル型
type ShiftType = "宿直" | "二交代" | "日直主" | "日直副";

// 更新リクエストの各エントリの型
interface UpdateEntry {
  date: string;
  addTai: string[];
  removeTai: string[];
  addNikutai: string[];
  removeNikutai: string[];
  addNichokuShu: string[];
  removeNichokuShu: string[];
  addNichokuFuku: string[];
  removeNichokuFuku: string[];
}

// リクエストボディ全体の型
interface RequestBody {
  month: string;
  updates: UpdateEntry[];
}

// 各シフトタイプごとに、更新時の追加・削除用のプロパティ名を定義
const shiftFieldMapping: { [key in ShiftType]: { add: keyof UpdateEntry; remove: keyof UpdateEntry } } = {
  宿直: { add: "addTai", remove: "removeTai" },
  二交代: { add: "addNikutai", remove: "removeNikutai" },
  日直主: { add: "addNichokuShu", remove: "removeNichokuShu" },
  日直副: { add: "addNichokuFuku", remove: "removeNichokuFuku" },
};

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json();
    const { updates } = body;

    // 各更新エントリについて処理
    for (const entry of updates) {
      const dateStr = entry.date;
      // 各シフトタイプごとに、追加・削除の処理を実施
      (Object.keys(shiftFieldMapping) as ShiftType[]).forEach(async (shiftType) => {
        const mapping = shiftFieldMapping[shiftType];
        const addList = entry[mapping.add] as string[];
        const removeList = entry[mapping.remove] as string[];

        // 追加リストに対して、対象の日付をフィールドに追加
        for (const staffId of addList) {
          const staffRef = doc(db, "staff", staffId);
          await updateDoc(staffRef, {
            [shiftType]: arrayUnion(dateStr),
          });
        }

        // 削除リストに対して、対象の日付をフィールドから削除
        for (const staffId of removeList) {
          const staffRef = doc(db, "staff", staffId);
          await updateDoc(staffRef, {
            [shiftType]: arrayRemove(dateStr),
          });
        }
      });
    }

    return NextResponse.json({ message: "夜勤シフト情報が更新されました" });
  } catch (error) {
    console.error("夜勤シフト情報更新エラー:", error);
    return NextResponse.json(
      { error: "夜勤シフト情報の更新に失敗しました" },
      { status: 500 }
    );
  }
}
