import { Hero } from "@/components/landing/Hero";
import { LazyAgentsScroll, LazySmoothScroll } from "@/components/landing/Lazy";
import { Faq, Features, FinalCta, Footer, Marquee, Nav } from "@/components/landing/Sections";

export default function Landing() {
  return (
    <>
      <LazySmoothScroll />
      <Nav />
      <main id="main">
        <Hero />
        <Marquee />
        <LazyAgentsScroll />
        <Features />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
