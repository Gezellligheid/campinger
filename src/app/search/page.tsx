import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SearchResults from "@/components/search/SearchResults";

export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  const params = await searchParams;
  const location = typeof params.location === "string" ? params.location : "";
  const collection = typeof params.collection === "string" ? params.collection : "";

  return (
    <>
      <Header />
      <main className="flex flex-1 flex-col">
        <SearchResults location={location} collection={collection} />
      </main>
      <Footer />
    </>
  );
}
