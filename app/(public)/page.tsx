import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import ServiceCards from "@/components/landing/ServiceCards";
import Differentiators from "@/components/landing/Differentiators";
import HowItWorks from "@/components/landing/HowItWorks";
import CTASection from "@/components/landing/CTASection";
import Footer from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gl-paper text-gl-ink" style={{ fontFamily: "var(--font-body)" }}>
      <Navbar />
      <Hero />
      <ServiceCards />
      <Differentiators />
      <HowItWorks />
      <CTASection />
      <Footer />
    </div>
  );
}
