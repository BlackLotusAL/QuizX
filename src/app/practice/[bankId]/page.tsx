import { PracticePage } from "@/components/practice-page";

interface PracticeRouteProps {
  params: Promise<{ bankId: string }>;
}

export default async function PracticeRoute({ params }: PracticeRouteProps) {
  const { bankId } = await params;
  return <PracticePage bankId={bankId} />;
}
