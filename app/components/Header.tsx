// components/Header.tsx
import Link from "next/link";

export default function Header() {
  return (
    <header className="bg-gray-200 shadow-md">
      <nav className="max-w-7xl mx-auto px-4 py-4">
        <ul className="flex items-center space-x-6">
          <li>
            <Link href="/" className="text-gray-700 hover:text-blue-500 font-medium">
              部門用作成
            </Link>
          </li>
          <li>
            <Link href="/nightShift" className="text-gray-700 hover:text-blue-500 font-medium">
              夜勤用作成
            </Link>
          </li>
          <li>
            <Link href="/position-edit" className="text-gray-700 hover:text-blue-500 font-medium">
              ポジション編集
            </Link>
          </li>
          <li>
            <Link href="/staff-edit" className="text-gray-700 hover:text-blue-500 font-medium">
              スタッフ編集
            </Link>
          </li>
          <li>
            <Link href="/holiday-edit" className="text-gray-700 hover:text-blue-500 font-medium">
              休み編集
            </Link>
          </li>
          {/* <li>
            <Link href="/blood-edit" className="text-gray-700 hover:text-blue-500 font-medium">
              採血者編集
            </Link>
          </li> */}
          <li>
            <Link href="/staff-list" className="text-gray-700 hover:text-blue-500 font-medium">
              スタッフリスト
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
