// app/holiday-edit/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import Select from "react-select";
import { format, startOfMonth, endOfMonth, addDays, getDay } from "date-fns";
import { Box, Button, TextField, Typography } from "@mui/material";

interface StaffOption {
  id: string;
  name: string;
  departments: string[]; // 部門情報も含む
}

type HolidayType = "yukyu" | "furikyu" | "daikyu";

interface HolidayDataEntry {
  yukyu: string[];
  furikyu: string[];
  daikyu: string[];
}

interface HolidayData {
  [date: string]: HolidayDataEntry;
}

interface DayCellProps {
  date: Date | null;
  holidayData?: HolidayDataEntry;
  staffOptions: StaffOption[];
  onChange: (type: HolidayType, values: string[]) => void;
}

const DayCell: React.FC<DayCellProps> = ({ date, holidayData, staffOptions, onChange }) => {
  if (!date) {
    return <Box sx={{ border: 1, p: 1, borderRadius: 1, minHeight: "100px", bgcolor: "#f0f0f0" }} />;
  }

  const dayLabel = format(date, "d");
  // react-select用のオプション
  const selectOptions = staffOptions.map((s) => ({ value: s.id, label: s.name }));

  const renderSelect = (type: HolidayType, label: string) => {
    const currentValues = holidayData ? holidayData[type].filter((v) => v.trim() !== "") : [];
    const selectedOptions = selectOptions.filter((opt) =>
      currentValues.includes(opt.value)
    );
    return (
      <Box mb={1}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Select
          isMulti
          options={selectOptions}
          value={selectedOptions}
          onChange={(selected) =>
            onChange(
              type,
              selected ? selected.map((item) => item.value) : []
            )
          }
          placeholder="選択..."
          styles={{
            control: (provided) => ({
              ...provided,
              minHeight: "28px",
              fontSize: "0.75rem",
            }),
            multiValue: (provided) => ({
              ...provided,
              fontSize: "0.7rem",
            }),
          }}
        />
      </Box>
    );
  };

  return (
    <Box border={1} p={1} borderRadius={1} bgcolor="white" minHeight="100px">
      <Typography variant="subtitle2" align="center" gutterBottom>
        {dayLabel}
      </Typography>
      {renderSelect("yukyu", "有休")}
      {renderSelect("furikyu", "振休")}
      {renderSelect("daikyu", "代休")}
    </Box>
  );
};

export default function HolidayEditPage() {
  const today = new Date();
  const defaultMonth = format(today, "yyyy-MM");
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [calendarWeeks, setCalendarWeeks] = useState<(Date | null)[][]>([]);
  const [holidayData, setHolidayData] = useState<HolidayData>({});
  const [originalHolidayData, setOriginalHolidayData] = useState<HolidayData>({});
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  // 部門フィルター用の状態（空文字なら全スタッフ表示）
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");

  useEffect(() => {
    generateCalendar(selectedMonth);
    loadHolidayData(selectedMonth);
  }, [selectedMonth]);

  useEffect(() => {
    fetchStaffOptions();
  }, []);

  // カレンダーの週データ生成（日曜日開始）
  const generateCalendar = (monthStr: string) => {
    const [year, month] = monthStr.split("-").map(Number);
    const firstDay = startOfMonth(new Date(year, month - 1));
    const lastDay = endOfMonth(new Date(year, month - 1));

    let current = firstDay;
    const weeks: (Date | null)[][] = [];
    let week: (Date | null)[] = new Array(getDay(firstDay)).fill(null);

    while (current <= lastDay) {
      week.push(new Date(current));
      current = addDays(current, 1);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    while (week.length < 7) {
      week.push(null);
    }
    weeks.push(week);
    setCalendarWeeks(weeks);
  };

  // staffコレクションからスタッフ情報を取得
  const fetchStaffOptions = async () => {
    const res = await fetch("/api/staff");
    if (res.ok) {
      const data: StaffOption[] = await res.json();
      setStaffOptions(data);
    }
  };

  // 休みデータの取得
  const loadHolidayData = async (month: string) => {
    const res = await fetch(`/api/holidays?month=${month}`);
    if (res.ok) {
      const data: HolidayData = await res.json();
      console.log("取得した holidayData:", data);
      setHolidayData(data);
      setOriginalHolidayData(data);
    }
  };

  const handleConfirm = async () => {
    // 例: holidayData の変更差分を送信する
    const updates: {
      date: string;
      addYukyu: string[];
      removeYukyu: string[];
      addFurikyu: string[];
      removeFurikyu: string[];
      addDaikyu: string[];
      removeDaikyu: string[];
    }[] = [];
  
    // ここで originalHolidayData と holidayData の差分を計算する処理を実装してください
    // 例:
    for (const [date, entry] of Object.entries(holidayData)) {
      const orig = originalHolidayData[date] || { yukyu: [], furikyu: [], daikyu: [] };
      const cleanedYukyu = entry.yukyu.map(s => s.trim()).filter(s => s !== "");
      const cleanedFurikyu = entry.furikyu.map(s => s.trim()).filter(s => s !== "");
      const cleanedDaikyu = entry.daikyu.map(s => s.trim()).filter(s => s !== "");
      const addYukyu = cleanedYukyu.filter(s => !orig.yukyu.includes(s));
      const removeYukyu = orig.yukyu.filter(s => !cleanedYukyu.includes(s));
      const addFurikyu = cleanedFurikyu.filter(s => !orig.furikyu.includes(s));
      const removeFurikyu = orig.furikyu.filter(s => !cleanedFurikyu.includes(s));
      const addDaikyu = cleanedDaikyu.filter(s => !orig.daikyu.includes(s));
      const removeDaikyu = orig.daikyu.filter(s => !cleanedDaikyu.includes(s));
      if (
        addYukyu.length ||
        removeYukyu.length ||
        addFurikyu.length ||
        removeFurikyu.length ||
        addDaikyu.length ||
        removeDaikyu.length
      ) {
        updates.push({
          date,
          addYukyu,
          removeYukyu,
          addFurikyu,
          removeFurikyu,
          addDaikyu,
          removeDaikyu,
        });
      }
    }
  
    if (updates.length === 0) {
      alert("変更はありません");
      return;
    }
  
    const res = await fetch("/api/holidays/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: selectedMonth, updates }),
    });
  
    if (res.ok) {
      alert("休み情報が更新されました");
      loadHolidayData(selectedMonth);
    } else {
      alert("更新に失敗しました");
    }
  };  
  
  // 選択された部門に基づくスタッフの絞り込み
  const filteredStaffOptions = useMemo(() => {
    if (!selectedDepartment) return staffOptions;
    return staffOptions.filter((s) =>
      s.departments && s.departments.includes(selectedDepartment)
    );
  }, [staffOptions, selectedDepartment]);

  // 各日ごとの休みデータ更新
  const handleDayChange = (date: Date, type: HolidayType, values: string[]) => {
    const dateStr = format(date, "yyyy-MM-dd");
    setHolidayData((prev) => ({
      ...prev,
      [dateStr]: {
        ...(prev[dateStr] || { yukyu: [], furikyu: [], daikyu: [] }),
        [type]: values,
      },
    }));
  };

  // 部門フィルター用：スタッフコレクションから一意の部門一覧を生成
  const departmentOptions = useMemo(() => {
    const depts = staffOptions.flatMap((s) => s.departments || []);
    return Array.from(new Set(depts));
  }, [staffOptions]);

  // 休みデータクリア処理（2年以上前のデータを削除する API を呼ぶ）
  const handleClear = async () => {
    const res = await fetch("/api/holidays/clear", { method: "POST" });
    if (res.ok) {
      alert("2年以上前の休みデータがクリアされました");
      loadHolidayData(selectedMonth);
    } else {
      alert("休みデータのクリアに失敗しました");
    }
  };

  return (
    <Box sx={{ maxWidth: 4/5, mx: "auto", p: 2 }}>
      <Typography variant="h4" gutterBottom>
        休み編集
      </Typography>
      <TextField
        type="month"
        label="対象月"
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(e.target.value)}
        variant="outlined"
        margin="normal"
        fullWidth
        sx={{ maxWidth: 300 }}
      />
      {/* 部門フィルター用プルダウン */}
      <Box sx={{ my: 2, maxWidth: 300 }}>
        <Typography variant="subtitle1">部門選択:</Typography>
        <Select
          options={departmentOptions.map((dept) => ({ value: dept, label: dept }))}
          value={selectedDepartment ? { value: selectedDepartment, label: selectedDepartment } : null}
          onChange={(option) => setSelectedDepartment(option ? option.value : "")}
          placeholder="部門を選択"
          isClearable
          styles={{
            control: (provided) => ({ ...provided, minHeight: "36px", fontSize: "0.875rem" }),
            placeholder: (provided) => ({ ...provided, fontSize: "0.875rem" }),
          }}
        />
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, my: 2 }}>
        {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
          <Typography key={day} align="center" sx={{ fontWeight: 600 }}>
            {day}
          </Typography>
        ))}
        {calendarWeeks.map((week, weekIndex) =>
          week.map((date, index) => (
            <DayCell
              key={`${weekIndex}-${index}`}
              date={date}
              holidayData={
                date
                  ? holidayData[format(date, "yyyy-MM-dd")] || {
                      yukyu: [],
                      furikyu: [],
                      daikyu: [],
                    }
                  : undefined
              }
              // 選択された部門フィルターに基づいてスタッフ選択肢を表示
              staffOptions={filteredStaffOptions}
              onChange={(type, values) => date && handleDayChange(date, type, values)}
            />
          ))
        )}
      </Box>
      <Box sx={{ display: "flex", gap: 2 }}>
        <Button variant="contained" color="primary" onClick={handleConfirm} >
          確定
        </Button>
        <Button variant="contained" color="error" onClick={handleClear}>
          古い休みデータをクリア
        </Button>
        <p>＊”古い休みデータをクリア”を押すと2年以上経過した休みデータが削除されます。データ量圧迫を防ぐために行って下さい</p>
      </Box>
    </Box>
  );
}
