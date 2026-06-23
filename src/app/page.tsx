import { Navbar } from "@/components/marketing/navbar";
import { Hero } from "@/components/marketing/hero";
import { TrustMarquee, Features } from "@/components/marketing/features";
import { Showcase } from "@/components/marketing/showcase";
import { Gallery } from "@/components/marketing/gallery";
import { HowItWorks, Pricing } from "@/components/marketing/pricing";
import { Testimonials, Faq } from "@/components/marketing/testimonials-faq";
import { DownloadCta } from "@/components/marketing/download-cta";
import { Footer } from "@/components/marketing/footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <TrustMarquee />
        <Features />
        <Showcase />
        <Gallery />
        <HowItWorks />
        <Pricing />
        <Testimonials />
        <Faq />
        <DownloadCta />
      </main>
      <Footer />
    </div>
  );
}
