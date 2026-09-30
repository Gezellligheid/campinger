import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import CollectionsSection from "@/components/CollectionsSection";
import TrustSection from "@/components/TrustSection";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero />
        <CollectionsSection />
        <TrustSection />
      </main>
      <Footer />
    </>
  );
}
