import { BankListPage } from "@/components/bank-list-page";

interface HomePageProps {
  searchParams: Promise<{ notice?: string | string[] }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { notice } = await searchParams;
  const initialNotice = notice === "bank-not-found"
    ? "题库不存在或已被删除，请重新选择"
    : undefined;

  return <BankListPage initialNotice={initialNotice} />;
}
