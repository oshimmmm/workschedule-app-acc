// app/api/positions/route.ts
import { NextResponse } from 'next/server';
import db from '../../../firebase/db';
import { collection, getDocs, addDoc } from 'firebase/firestore';

export async function GET() {
  const snapshot = await getDocs(collection(db, 'positions'));
  const positions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json(positions);
}

export async function POST(request: Request) {
  const body = await request.json();
  const docRef = await addDoc(collection(db, 'positions'), body);
  return NextResponse.json({ id: docRef.id, ...body });
}
