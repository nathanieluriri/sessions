import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PublicLayout } from "../components/Layout";
import { Btn, ErrorBox, Loading } from "../components/ui";
import { ReceiptCard, type ReceiptData } from "../components/receipt";
import { api } from "../lib/api";

export function ReceiptPage() {
  const { token = "" } = useParams();
  const [d, setD] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<ReceiptData>(`/receipts/${encodeURIComponent(token)}`).then(setD, (e) => setError(e.message));
  }, [token]);
  return (
    <PublicLayout title="Receipt" bare>
      <section className="section"><div className="wrap stack gap24" style={{ alignItems: "center", paddingTop: 40 }}>
        {error ? <ErrorBox error={error} /> : !d ? <Loading /> : (
          <>
            <ReceiptCard d={d} />
            <Btn kind="neutral" className="noprint" onClick={() => window.print()}>Print receipt</Btn>
          </>
        )}
      </div></section>
    </PublicLayout>
  );
}
