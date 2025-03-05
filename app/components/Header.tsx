// components/Header.tsx
import Link from 'next/link';

export default function Header() {
  return (
    <header style={{ padding: '1rem', borderBottom: '1px solid #ccc' }}>
      <nav>
        <ul style={{ display: 'flex', gap: '1rem', listStyle: 'none', padding: 0 }}>
          <li><Link href="/">作成</Link></li>
          <li><Link href="/position-edit">ポジション編集</Link></li>
          <li><Link href="/staff-edit">スタッフ編集</Link></li>
          <li><Link href="/holiday-edit">休み編集</Link></li>
          <li><Link href="/staff-list">スタッフリスト</Link></li>
        </ul>
      </nav>
    </header>
  );
}
