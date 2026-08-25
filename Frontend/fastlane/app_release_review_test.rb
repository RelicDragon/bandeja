# frozen_string_literal: true

require "fastlane"

Fastlane.load_actions
fastfile_path = File.expand_path("Fastfile", __dir__)
fastfile = Fastlane::FastFile.new
fastfile.parse(File.read(fastfile_path), fastfile_path)

def assert(condition, message)
  raise "FAIL: #{message}" unless condition
end

Artifact = Struct.new(:version_code)
Release = Struct.new(:release_lifecycle_state, :release_name, :active_artifacts)
Response = Struct.new(:releases)
Edit = Struct.new(:id)

class FakePublisherService
  attr_reader :commits, :deleted_edits
  attr_accessor :releases

  def initialize(releases)
    @releases = releases
    @commits = []
    @deleted_edits = []
  end

  def list_application_track_releases(parent)
    raise "unexpected parent #{parent}" unless parent ==
      "applications/com.funified.bandeja/tracks/production"

    Response.new(releases)
  end

  def commit_edit(package_name, edit_id, changes_in_review_behavior:)
    commits << [package_name, edit_id, changes_in_review_behavior]
    Edit.new(edit_id)
  end

  def delete_edit(package_name, edit_id)
    deleted_edits << [package_name, edit_id]
  end
end

class FakeApp
  attr_reader :query

  def initialize(submissions)
    @submissions = submissions
  end

  def get_review_submissions(**query)
    @query = query
    @submissions
  end
end

published = Release.new("RELEASE_LIFECYCLE_STATE_PUBLISHED", "0.97.30", [Artifact.new(212)])
reviewed = Release.new("RELEASE_LIFECYCLE_STATE_IN_REVIEW", "0.97.31", [Artifact.new(213)])
service = FakePublisherService.new([published, reviewed])
assert(
  AppReleaseStoreReview.google_in_review_release(service) == reviewed,
  "read-only lookup selects the production release in review"
)

fastfile.install_explicit_google_review_commit!

def supply_client_with(service)
  client = Supply::Client.allocate
  client.client = service
  client.current_package_name = "com.funified.bandeja"
  client.current_edit = Edit.new("edit-1")
  client
end

ENV["APP_RELEASE_GOOGLE_REVIEW_BEHAVIOR"] = "CANCEL_IN_REVIEW_AND_SUBMIT"
ENV["APP_RELEASE_GOOGLE_EXPECTED_REVIEW_VERSION_CODE"] = "213"
ENV["APP_RELEASE_GOOGLE_EXPECTED_REVIEW_VERSION_CODES"] = "213"
ENV["APP_RELEASE_GOOGLE_EXPECTED_REVIEW_VERSION"] = "0.97.31"
supply_client_with(service).commit_current_edit!
assert(
  service.commits.last == [
    "com.funified.bandeja",
    "edit-1",
    "CANCEL_IN_REVIEW_AND_SUBMIT"
  ],
  "exact approved Google review is replaced"
)

no_review_service = FakePublisherService.new([published])
supply_client_with(no_review_service).commit_current_edit!
assert(
  no_review_service.commits.last.last == "ERROR_IF_IN_REVIEW",
  "completed old review falls back to an atomic no-replacement commit"
)

changed = Release.new("RELEASE_LIFECYCLE_STATE_IN_REVIEW", "0.97.32", [Artifact.new(214)])
changed_service = FakePublisherService.new([changed])
begin
  supply_client_with(changed_service).commit_current_edit!
  raise "FAIL: changed Google review should block commit"
rescue FastlaneCore::Interface::FastlaneError => error
  assert(error.message.include?("APP_RELEASE_GOOGLE_REVIEW_CONFLICT"), "changed review is explicit")
end
assert(changed_service.commits.empty?, "changed Google review is never committed")
assert(
  changed_service.deleted_edits == [["com.funified.bandeja", "edit-1"]],
  "mismatched Google edit is explicitly discarded"
)

expanded = Release.new(
  "RELEASE_LIFECYCLE_STATE_IN_REVIEW",
  "0.97.31",
  [Artifact.new(213), Artifact.new(214)]
)
expanded_service = FakePublisherService.new([expanded])
begin
  supply_client_with(expanded_service).commit_current_edit!
  raise "FAIL: expanded Google review should block commit"
rescue FastlaneCore::Interface::FastlaneError => error
  assert(error.message.include?("APP_RELEASE_GOOGLE_REVIEW_CONFLICT"), "artifact-set change is explicit")
end
assert(expanded_service.commits.empty?, "changed Google artifact set is never committed")

canceling = Struct.new(:state).new(
  Spaceship::ConnectAPI::ReviewSubmission::ReviewSubmissionState::CANCELING
)
fake_app = FakeApp.new([canceling])
assert(
  AppReleaseStoreReview.ios_blocking_review_submission(fake_app, "IOS") == canceling,
  "a CANCELING App Store submission still blocks upload"
)
assert(
  fake_app.query.dig(:filter, :state).include?("CANCELING"),
  "App Store lookup explicitly requests CANCELING submissions"
)
assert(
  !AppReleaseStoreReview.ios_removal_complete?(canceling),
  "App Store cancellation waits while state is CANCELING"
)
complete = Struct.new(:state).new(
  Spaceship::ConnectAPI::ReviewSubmission::ReviewSubmissionState::COMPLETE
)
assert(
  AppReleaseStoreReview.ios_removal_complete?(complete),
  "App Store cancellation finishes only at COMPLETE"
)

blocking_submission = Struct.new(:id).new("submission-new")
fastfile.define_singleton_method(:ios_blocking_review_submission) { blocking_submission }
begin
  fastfile.send(:guard_no_ios_blocking_review!, "before final submission")
  raise "FAIL: final App Store submission guard should block"
rescue FastlaneCore::Interface::FastlaneError => error
  assert(error.message.include?("APP_RELEASE_IOS_REVIEW_CONFLICT:submission-new"), "late Apple conflict is explicit")
  assert(error.message.include?("before final submission"), "late Apple guard identifies its boundary")
end

[
  "APP_RELEASE_GOOGLE_REVIEW_BEHAVIOR",
  "APP_RELEASE_GOOGLE_EXPECTED_REVIEW_VERSION_CODE",
  "APP_RELEASE_GOOGLE_EXPECTED_REVIEW_VERSION_CODES",
  "APP_RELEASE_GOOGLE_EXPECTED_REVIEW_VERSION"
].each { |key| ENV.delete(key) }

puts "fastlane app-release review tests: OK"
