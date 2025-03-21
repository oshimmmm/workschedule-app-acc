"use client";
import React, { useState, useEffect, useMemo } from "react";
import Select from "react-select";
import { format, startOfMonth, endOfMonth, addDays, getDay } from "date-fns";
import { Box, Button, TextField, Typography } from "@mui/material";

interface StaffOption {
  id: string;
  name: string;
  departments: string[]; // 部門情報
}

type NightShiftType = "待機" | "二交代" | "日直主" | "日直副";

interface ShiftDataEntry {
  待機: string[];
  二交代: string[];
  日直主: string[];
  日直副: string[];
}

interface ShiftData {
  [date: string]: ShiftDataEntry;
}

interface DayCellProps {
  date: Date | null;
  shiftData?: ShiftDataEntry;
  staffOptions: StaffOption[];
  onChange: (type: NightShiftType, values: string[]) => void;
}

const DayCell: React.FC<DayCellProps> = ({ date, shiftData, staffOptions, onChange }) => {
  if (!date) {
    return (
      <Box
        sx={{
          border: 1,
          p: 1,
          borderRadius: 1,
          minHeight: "100px",
          bgcolor: "#f0f0f0",
        }}
      />
    );
  }

  const dayLabel = format(date, "d");
  const selectOptions = staffOptions.map((s) => ({ value: s.id, label: s.name }));

  const renderSelect = (type: NightShiftType, label: string) => {
    const currentValues = shiftData ? shiftData[type].filter((v) => v.trim() !== "") : [];
    const selectedOptions = selectOptions.filter((opt) => currentValues.includes(opt.value));
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
            onChange(type, selected ? selected.map((item) => item.value) : [])
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
      {renderSelect("待機", "待機")}
      {renderSelect("二交代", "二交代")}
      {renderSelect("日直主", "日直主")}
      {renderSelect("日直副", "日直副")}
    </Box>
  );
};

export default function NightShiftEditPage() {
  const today = new Date();
  const defaultMonth = format(today, "yyyy-MM");
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [calendarWeeks, setCalendarWeeks] = useState<(Date | null)[][]>([]);
  const [shiftData, setShiftData] = useState<ShiftData>({});
  const [originalShiftData, setOriginalShiftData] = useState<ShiftData>({});
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");

  useEffect(() => {
    generateCalendar(selectedMonth);
    loadShiftData(selectedMonth);
  }, [selectedMonth]);

  useEffect(() => {
    fetchStaffOptions();
  }, []);

  // 対象月のカレンダー（週ごとにDateまたはnullの配列）を生成
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

  // スタッフ情報の取得
  const fetchStaffOptions = async () => {
    const res = await fetch("/api/staff");
    if (res.ok) {
      const data: StaffOption[] = await res.json();
      setStaffOptions(data);
    }
  };

  // 夜勤シフトデータの取得（対象月指定）
  const loadShiftData = async (month: string) => {
    const res = await fetch(`/api/nightEdit?month=${month}`);
    if (res.ok) {
      const data: ShiftData = await res.json();
      console.log("取得した shiftData:", data);
      setShiftData(data);
      setOriginalShiftData(data);
    }
  };

  const handleConfirm = async () => {
    // 例: shiftData の変更差分を計算して更新する
    const updates: {
      date: string;
      addTai: string[]; // 「待機」の追加
      removeTai: string[];
      addNikutai: string[]; // 「二交代」
      removeNikutai: string[];
      addNichokuShu: string[]; // 「日直主」
      removeNichokuShu: string[];
      addNichokuFuku: string[]; // 「日直副」
      removeNichokuFuku: string[];
    }[] = [];

    for (const [date, entry] of Object.entries(shiftData)) {
      const orig = originalShiftData[date] || { 待機: [], 二交代: [], 日直主: [], 日直副: [] };
      const cleanedTai = entry.待機.map((s) => s.trim()).filter((s) => s !== "");
      const cleanedNikutai = entry.二交代.map((s) => s.trim()).filter((s) => s !== "");
      const cleanedNichokuShu = entry.日直主.map((s) => s.trim()).filter((s) => s !== "");
      const cleanedNichokuFuku = entry.日直副.map((s) => s.trim()).filter((s) => s !== "");

      const addTai = cleanedTai.filter((s) => !orig.待機.includes(s));
      const removeTai = orig.待機.filter((s) => !cleanedTai.includes(s));
      const addNikutai = cleanedNikutai.filter((s) => !orig.二交代.includes(s));
      const removeNikutai = orig.二交代.filter((s) => !cleanedNikutai.includes(s));
      const addNichokuShu = cleanedNichokuShu.filter((s) => !orig.日直主.includes(s));
      const removeNichokuShu = orig.日直主.filter((s) => !cleanedNichokuShu.includes(s));
      const addNichokuFuku = cleanedNichokuFuku.filter((s) => !orig.日直副.includes(s));
      const removeNichokuFuku = orig.日直副.filter((s) => !cleanedNichokuFuku.includes(s));

      if (
        addTai.length ||
        removeTai.length ||
        addNikutai.length ||
        removeNikutai.length ||
        addNichokuShu.length ||
        removeNichokuShu.length ||
        addNichokuFuku.length ||
        removeNichokuFuku.length
      ) {
        updates.push({
          date,
          addTai,
          removeTai,
          addNikutai,
          removeNikutai,
          addNichokuShu,
          removeNichokuShu,
          addNichokuFuku,
          removeNichokuFuku,
        });
      }
    }

    if (updates.length === 0) {
      alert("変更はありません");
      return;
    }

    const res = await fetch("/api/nightEdit/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: selectedMonth, updates }),
    });

    if (res.ok) {
      alert("夜勤シフト情報が更新されました");
      loadShiftData(selectedMonth);
    } else {
      alert("更新に失敗しました");
    }
  };

  // 部門フィルターによるスタッフ絞り込み
  const filteredStaffOptions = useMemo(() => {
    if (!selectedDepartment) return staffOptions;
    return staffOptions.filter((s) =>
      s.departments && s.departments.includes(selectedDepartment)
    );
  }, [staffOptions, selectedDepartment]);

  // 各日ごとのシフトデータ更新
  const handleDayChange = (date: Date, type: NightShiftType, values: string[]) => {
    const dateStr = format(date, "yyyy-MM-dd");
    setShiftData((prev) => ({
      ...prev,
      [dateStr]: {
        ...(prev[dateStr] || { 待機: [], 二交代: [], 日直主: [], 日直副: [] }),
        [type]: values,
      },
    }));
  };

  // スタッフ情報から一意の部門一覧を生成
  const departmentOptions = useMemo(() => {
    const depts = staffOptions.flatMap((s) => s.departments || []);
    return Array.from(new Set(depts));
  }, [staffOptions]);

  // 古いシフトデータをクリアする処理（例：2年以上前のデータ削除 API）
  const handleClear = async () => {
    const res = await fetch("/api/nightEdit/clear", { method: "POST" });
    if (res.ok) {
      alert("2年以上前の夜勤シフトデータがクリアされました");
      loadShiftData(selectedMonth);
    } else {
      alert("夜勤シフトデータのクリアに失敗しました");
    }
  };

  return (
    <Box sx={{ maxWidth: "90%", mx: "auto", p: 2 }}>
      <Typography variant="h4" gutterBottom>
        夜勤シフト編集
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
              shiftData={
                date
                  ? shiftData[format(date, "yyyy-MM-dd")] || {
                      待機: [],
                      二交代: [],
                      日直主: [],
                      日直副: [],
                    }
                  : undefined
              }
              staffOptions={filteredStaffOptions}
              onChange={(type, values) => date && handleDayChange(date, type, values)}
            />
          ))
        )}
      </Box>
      <Box sx={{ display: "flex", gap: 2 }}>
        <Button variant="contained" color="primary" onClick={handleConfirm}>
          確定
        </Button>
        <Button variant="contained" color="error" onClick={handleClear}>
          夜勤シフトデータクリア
        </Button>
      </Box>
    </Box>
  );
}
