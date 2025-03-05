// app/staff-list/page.tsx
"use client";
import { useState, useEffect } from 'react';

interface Staff {
  id?: string;
  name: string;
  department: string;
  availablePositions: string[];
  holidays?: string[];
}

export default function StaffListPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);

  useEffect(() => {
    fetch('/api/staff')
      .then(res => res.json())
      .then(data => setStaffList(data));
  }, []);

  return (
    <div style={{ padding: '1rem' }}>
      <h1>スタッフリスト</h1>
      <ul>
        {staffList.map(staff => (
          <li key={staff.id}>
            {staff.name} — {staff.department} — 配置可能: {staff.availablePositions.join(', ')}
            {staff.holidays && ` — 休み: ${staff.holidays.join(', ')}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
