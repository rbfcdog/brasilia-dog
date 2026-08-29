import { PageFrame } from "@/components/pages/page-frame";
import { ProfileSettings } from "@/components/pages/profile-settings";

export default function ProfilePage() {
  return (
    <PageFrame eyebrow="Account controls" title="Profile and permissions" description="Review your authentication state and the protections used when you approve purchase authority.">
      <ProfileSettings />
    </PageFrame>
  );
}
