import { redirect } from "next/navigation";

// Legacy route (kept for backward compatibility)
export default function Page(){
  redirect("/universe");
}
