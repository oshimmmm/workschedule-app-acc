import { NextResponse } from "next/server";
import db from "../../../firebase/db";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
} from "firebase/firestore";

// GET: 登録済みのポジション情報一覧を取得
export async function GET() {
  const snapshot = await getDocs(collection(db, "positions"));
  const positions = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
  return NextResponse.json(positions);
}

// POST: 新規ポジション情報を登録
export async function POST(request: Request) {
  const body = await request.json();
  // 新たに allowMultiple を含める
  const docRef = await addDoc(collection(db, "positions"), body);
  return NextResponse.json({ id: docRef.id, ...body });
}

// PUT: 既存ポジション情報の更新（編集）
export async function PUT(request: Request) {
  const body = await request.json();
  const { id, ...data } = body;
  if (!id) {
    return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
  }
  const posRef = doc(db, "positions", id);
  await updateDoc(posRef, data);
  return NextResponse.json({ id, ...data });
}