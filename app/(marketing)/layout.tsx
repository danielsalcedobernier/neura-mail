// This layout is a transparent wrapper for the (marketing) route group.
// Each sub-segment (root ES pages and /en) has its own layout that adds
// the correct Navbar/Footer for its language — so we render nothing extra here.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
