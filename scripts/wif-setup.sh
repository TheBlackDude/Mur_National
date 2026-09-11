#!/usr/bin/env bash
# Keyless GitHub Actions → Google Cloud auth (Workload Identity Federation).
# Replaces the service-account JSON key, which the org policy forbids.
# Usage: scripts/wif-setup.sh            (needs: gcloud auth login as a project owner)
set -euo pipefail
PROJECT="${PROJECT:-guinea68}"
REPO="${REPO:-TheBlackDude/Mur_National}"
POOL=github
PROVIDER=github-oidc
SA_NAME=github-deploy
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
echo "Project $PROJECT ($PROJECT_NUMBER)"

gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com \
  cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com \
  eventarc.googleapis.com pubsub.googleapis.com cloudscheduler.googleapis.com firebaserules.googleapis.com \
  --project "$PROJECT"

gcloud iam workload-identity-pools describe "$POOL" --project "$PROJECT" --location global >/dev/null 2>&1 ||
gcloud iam workload-identity-pools create "$POOL" --project "$PROJECT" --location global --display-name "GitHub Actions"

gcloud iam workload-identity-pools providers describe "$PROVIDER" --project "$PROJECT" --location global --workload-identity-pool "$POOL" >/dev/null 2>&1 ||
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project "$PROJECT" --location global \
  --workload-identity-pool "$POOL" --display-name "GitHub OIDC" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition "assertion.repository=='${REPO}'"

gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1 ||
gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT" --display-name "GitHub deploy"

for role in roles/editor roles/iam.serviceAccountUser roles/firebase.admin roles/cloudfunctions.admin roles/run.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:${SA}" --role "$role" --condition=None --quiet >/dev/null
  echo "granted $role"
done

gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$PROJECT" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" --quiet >/dev/null

# Runtime and build roles for the default compute service account (new organizations grant it nothing by default).
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for role in roles/cloudbuild.builds.builder roles/artifactregistry.writer roles/logging.logWriter roles/storage.objectViewer \
            roles/eventarc.eventReceiver roles/run.invoker roles/datastore.user roles/firebasedatabase.admin roles/storage.objectAdmin roles/firebaseauth.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:${COMPUTE_SA}" --role "$role" --condition=None --quiet >/dev/null
  echo "granted $role to compute SA"
done
# Service agents firebase-tools expects for 2nd-gen storage triggers.
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:service-${PROJECT_NUMBER}@gs-project-accounts.iam.gserviceaccount.com" --role roles/pubsub.publisher --condition=None --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com" --role roles/iam.serviceAccountTokenCreator --condition=None --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:${SA}" --role roles/resourcemanager.projectIamAdmin --condition=None --quiet >/dev/null

WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
gh variable set GCP_WIF_PROVIDER --repo "$REPO" --body "$WIF_PROVIDER"
gh variable set GCP_DEPLOY_SA --repo "$REPO" --body "$SA"
echo
echo "Done. GitHub variables set:"
echo "  GCP_# Runtime and build roles for the default compute service account (new organizations grant it nothing by default).
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for role in roles/cloudbuild.builds.builder roles/artifactregistry.writer roles/logging.logWriter roles/storage.objectViewer \
            roles/eventarc.eventReceiver roles/run.invoker roles/datastore.user roles/firebasedatabase.admin roles/storage.objectAdmin roles/firebaseauth.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:${COMPUTE_SA}" --role "$role" --condition=None --quiet >/dev/null
  echo "granted $role to compute SA"
done
# Service agents firebase-tools expects for 2nd-gen storage triggers.
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:service-${PROJECT_NUMBER}@gs-project-accounts.iam.gserviceaccount.com" --role roles/pubsub.publisher --condition=None --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com" --role roles/iam.serviceAccountTokenCreator --condition=None --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:${SA}" --role roles/resourcemanager.projectIamAdmin --condition=None --quiet >/dev/null

WIF_PROVIDER=$WIF_PROVIDER"
echo "  GCP_DEPLOY_SA=$SA"
