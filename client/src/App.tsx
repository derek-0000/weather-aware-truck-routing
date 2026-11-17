import { RouteGeneratorForm } from "@/components/route-generator/form";
import { RouteGeneratorMap } from "@/components/route-generator/map";
import { RouteGeneratorContext } from "@/components/route-generator/provider";

export default function App() {
  return (
    <main
      className="mx-auto flex min-h-svh w-[60%] flex-col justify-center gap-8 py-10"
      aria-label="Weather-aware truck routing form"
    >
      <RouteGeneratorContext>
        <RouteGeneratorForm />
        <RouteGeneratorMap />
      </RouteGeneratorContext>
    </main>
  );
}
