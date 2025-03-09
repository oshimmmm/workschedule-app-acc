import { NextResponse } from "next/server";
import db from "../../../firebase/db";
import { collection, getDocs } from "firebase/firestore";
import ExcelJS from "exceljs";

// 日本の祝日を外部APIから取得する例
async function getJapaneseHolidays(year: number, month: number): Promise<string[]> {
  // Holidays JP API は全祝日データを JSON で返します
  // 例: https://holidays-jp.github.io/api/v1/date.json
  try {
    const res = await fetch("https://holidays-jp.github.io/api/v1/date.json");
    if (!res.ok) {
      console.error("祝日API取得エラー", res.statusText);
      return [];
    }
    const data = await res.json(); // data は { "YYYY-MM-DD": "祝日名", ... } の形式
    const keyPrefix = `${year}-${month.toString().padStart(2, "0")}`;
    // keyPrefix で始まる日付を抽出
    const holidays = Object.keys(data).filter((date) => date.startsWith(keyPrefix));
    return holidays;
  } catch (error) {
    console.error("祝日API取得例外", error);
    return [];
  }
}

// isJapaneseHoliday 関数も非同期に対応させる必要があります
async function isJapaneseHoliday(date: Date): Promise<boolean> {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 0-basedなので+1
  const dateStr = date.toISOString().split("T")[0];
  const holidays = await getJapaneseHolidays(year, month);
  console.log(`祝日チェック: ${dateStr} ->`, holidays);
  return holidays.includes(dateStr);
}

// 指定月 (YYYY-MM) の日付一覧を生成
function getDatesInMonth(monthStr: string): Date[] {
  const [year, month] = monthStr.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) {
    return [];
  }
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const dates: Date[] = [];
  let current = new Date(firstDay);
  while (current <= lastDay) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export async function POST(request: Request) {
  const { month } = await request.json();
  if (!month) {
    return NextResponse.json({ error: "月が指定されていません" }, { status: 400 });
  }

  const dates = getDatesInMonth(month);
  if (dates.length === 0) {
    return NextResponse.json({ error: "指定された月の日付を取得できません" }, { status: 400 });
  }

  // Firestore からポジションとスタッフを取得
  const posSnapshot = await getDocs(collection(db, "positions"));
  const positions = posSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as any[];

  const staffSnapshot = await getDocs(collection(db, "staff"));
  const staffList = staffSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as any[];

  // 優先度（数値が小さいほど高い）でソート (1 が最優先)
  positions.sort((a, b) => a.priority - b.priority);

  // Excel ワークブック・シートの作成
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("勤務表");

  // A列に日付 (1行目は見出し) を設定
  worksheet.getCell("A1").value = "日付";

  // 休み表示用列設定 (K列=11, L=12, M=13, ...)
  const holidayColStart = 11;
  const maxHolidayCol = 5; // 1日に最大5人分の休みを想定
  worksheet.getCell("K1").value = "休み (1)";
  worksheet.getCell("L1").value = "休み (2)";
  worksheet.getCell("M1").value = "休み (3)";
  worksheet.getCell("N1").value = "休み (4)";
  worksheet.getCell("O1").value = "休み (5)";

  // ポジション情報を指定セルに出力（例: pos.outputCell === "B2" など）
  positions.forEach((pos) => {
    if (pos.outputCell) {
      worksheet.getCell(pos.outputCell).value = pos.name;
    }
  });

  // 1週間同一スタッフ用マップ: { "YYYY-MM-DD_posId": "staffName" }
  const weeklyAssignments: { [weekKey: string]: string } = {};

  // 日付→{ポジションID→スタッフ名[]} のマップ（各セルは複数スタッフを保持）
  const staffAssignments: { [dateStr: string]: { [posId: string]: string[] } } = {};

  console.log(`[generate] dates.length = ${dates.length}`);
  console.log(`[generate] positions.length = ${positions.length}`);
  console.log(`[generate] staffList.length = ${staffList.length}`);

  // 日付ごとにループ (インデックス i を使って行番号を決定)
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const dateStr = date.toISOString().split("T")[0];
    const rowIndex = i + 2; // 2行目以降に出力

    // A列に日付を出力
    worksheet.getCell(`A${rowIndex}`).value = dateStr;

    const day = date.getDay();

    // 休みスタッフ一覧 (staff.holidays に dateStr が含まれていれば休み)
    const holidayStaff = staffList.filter(
      (s) => s.holidays && s.holidays.includes(dateStr)
    );

    // K列以降に休みスタッフを表示
    for (let h = 0; h < holidayStaff.length && h < maxHolidayCol; h++) {
      const s = holidayStaff[h];
      const colLetter = String.fromCharCode((holidayColStart + h) + 64);
      worksheet.getCell(`${colLetter}${rowIndex}`).value = s.name;
    }

    // 土日・祝日はスタッフ配置をスキップ（休みのみ表示）
    const holidayFlag = await isJapaneseHoliday(date);
    if (day === 0 || day === 6 || holidayFlag) {
      continue;
    }

    // 初期化：この日の配置結果
    staffAssignments[dateStr] = {};

    // dailyAssigned: この日すでに配置されたスタッフ（同じ日で複数ポジションに配置されないよう管理）
    let dailyAssigned = new Set<string>();

    // 未配置スタッフの集合（スタッフ名）
    let unassignedStaff = new Set(staffList.map((s) => s.name));
    // 休みスタッフは除外
    holidayStaff.forEach((s) => {
      unassignedStaff.delete(s.name);
    });

    // ポジション優先度順にスタッフ配置
    for (const pos of positions) {
      // 初期化：各ポジションの割り当ては配列で保持
      staffAssignments[dateStr][pos.id] = [];

      // 1週間同一スタッフの処理
      let alreadyAssignedName: string | null = null;
      if (pos.sameStaffWeekly) {
        const currentDate = new Date(date);
        const diff = currentDate.getDay() === 0 ? -6 : 1 - currentDate.getDay();
        const weekStart = new Date(currentDate);
        weekStart.setDate(currentDate.getDate() + diff);
        const weekKey = `${weekStart.toISOString().split("T")[0]}_${pos.id}`;
        if (weeklyAssignments[weekKey]) {
          const staffName = weeklyAssignments[weekKey];
          if (!holidayStaff.some((hStaff) => hStaff.name === staffName)) {
            alreadyAssignedName = staffName;
          }
        }
      }

      // もし週で既に担当が決まっていて、かつそのスタッフがまだ配置されていなければ使用
      if (alreadyAssignedName && !dailyAssigned.has(alreadyAssignedName)) {
        staffAssignments[dateStr][pos.id].push(alreadyAssignedName);
        dailyAssigned.add(alreadyAssignedName);
        unassignedStaff.delete(alreadyAssignedName);
        continue;
      }

      // 配置可能なスタッフ：そのスタッフの availablePositions に pos.name が含まれ、
      // 未配置かつまだその日他のポジションに配置されていない
      const availableStaff = staffList
        .filter((s) => {
          if (!s.availablePositions || !Array.isArray(s.availablePositions)) return false;
          return (
            s.availablePositions.includes(pos.name) &&
            unassignedStaff.has(s.name) &&
            !dailyAssigned.has(s.name)
          );
        })
        .map((s) => s.name);

      if (availableStaff.length > 0) {
        const chosen =
          availableStaff[Math.floor(Math.random() * availableStaff.length)];
        staffAssignments[dateStr][pos.id].push(chosen);
        dailyAssigned.add(chosen);
        unassignedStaff.delete(chosen);
        if (pos.sameStaffWeekly) {
          const currentDate = new Date(date);
          const diff = currentDate.getDay() === 0 ? -6 : 1 - currentDate.getDay();
          const weekStart = new Date(currentDate);
          weekStart.setDate(currentDate.getDate() + diff);
          const weekKey = `${weekStart.toISOString().split("T")[0]}_${pos.id}`;
          weeklyAssignments[weekKey] = chosen;
        }
      } else {
        staffAssignments[dateStr][pos.id].push(pos.required ? "未配置" : "");
      }
    }

    // 「全スタッフが最低1つのポジションに入る」処理
    // 未配置スタッフを、availablePositions の数が少ない順にソート
    const stillUnassigned = Array.from(unassignedStaff)
      .map((name) => staffList.find((s) => s.name === name))
      .filter(Boolean)
      .sort((a, b) => a!.availablePositions.length - b!.availablePositions.length) as any[];

    // 各未配置スタッフについて、
    // 複数人配置を許容するポジションのみを候補とし、
    // その中で、候補の先頭（優先度順）に追加入力（上書きせず追加入力）
    for (const staffObj of stillUnassigned) {
      const candidatePositions = positions.filter((pos) =>
        staffObj.availablePositions.includes(pos.name) && pos.allowMultiple === true
      );
      if (candidatePositions.length > 0) {
        // candidatePositions は positions の順（既に優先度順にソート済み）なので、先頭を選ぶ
        const chosenPos = candidatePositions[0];
        if (!staffAssignments[dateStr][chosenPos.id]) {
          staffAssignments[dateStr][chosenPos.id] = [];
        }
        // 既に配置されていなければ追加入力
        if (!staffAssignments[dateStr][chosenPos.id].includes(staffObj.name)) {
          staffAssignments[dateStr][chosenPos.id].push(staffObj.name);
          dailyAssigned.add(staffObj.name);
        }
      }
    }
  }

  // B列以降に配置結果を出力 (B列: positions[0], C列: positions[1], …)
  positions.forEach((pos) => {
    if (!pos.outputCell) return;
    // outputCell 例："B2" → 列部分: "B", 行部分: 2
    const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
    if (!match) return; // 不正な形式の場合はスキップ
    const colLetter = match[1];         // "B"
    const baseRow = parseInt(match[2]);   // 2
    // 出力セル（baseRow）にポジション名を表示
    worksheet.getCell(pos.outputCell).value = pos.name;
    // スタッフ配置は baseRow + 1 から開始
    for (let i = 0; i < dates.length; i++) {
      const dateStr = dates[i].toISOString().split("T")[0];
      const targetRow = baseRow + 1 + i;
      const assignmentArr = staffAssignments[dateStr]?.[pos.id] || [];
      const assignment = assignmentArr.join(", ");
      worksheet.getCell(`${colLetter}${targetRow}`).value = assignment;
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const uint8Array = new Uint8Array(buffer);
  const arrayBuffer = uint8Array.buffer;
  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="kinmu.xlsx"',
    },
  });
}