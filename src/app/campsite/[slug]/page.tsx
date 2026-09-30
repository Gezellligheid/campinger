import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CampsiteDetailClient from "@/components/detail/CampsiteDetailClient";

export default async function CampsitePage({
  params,
}: PageProps<"/campsite/[slug]">) {
  const { slug } = await params;

  return (
    <>
      <Header />
      <main className="flex-1">
        <CampsiteDetailClient slug={slug} />
      </main>
      <Footer />
    </>
  );
}
