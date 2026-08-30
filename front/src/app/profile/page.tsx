import { PageFrame } from "@/components/pages/page-frame";
import { ProfileSettings } from "@/components/pages/profile-settings";

export default function ProfilePage() {
  return (
    <PageFrame eyebrow="Account controls" title="Profile and permissions" description="Manage authentication, purchase protections, and the payment preferences applied to new mandates.">
      <ProfileSettings />
    </PageFrame>
  );
}
