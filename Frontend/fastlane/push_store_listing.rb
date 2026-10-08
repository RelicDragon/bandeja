# frozen_string_literal: true

# Pushes localized store listing copy from store-listing.json to App Store Connect
# (editable app info + editable version) and Google Play (main listing).
# Dry run by default; pass --apply to write.
#   cd Frontend && bundle exec ruby fastlane/push_store_listing.rb [--apply] [--ios-only|--android-only]

require "fastlane"
require "spaceship"
require "json"
require "google/apis/androidpublisher_v3"
require "googleauth"

APP_ID = "com.funified.bandeja"
APPLY = ARGV.include?("--apply")
config = JSON.parse(File.read(File.join(__dir__, "store-listing.json"), encoding: "UTF-8"))
listings = config.fetch("listings")

LIMITS = {
  "name" => 30, "subtitle" => 30, "shortDescription" => 80,
  "description" => 4000, "whatsNew" => 4000, "keywords" => 100
}.freeze

errors = []
listings.each do |key, fields|
  LIMITS.each do |field, max|
    value = fields[field].to_s
    size = field == "keywords" ? value.bytesize : value.length
    errors << "#{key}.#{field}: #{size} > #{max}" if size > max
  end
end
abort("Length check failed:\n#{errors.join("\n")}") unless errors.empty?
puts "Length check OK#{APPLY ? '' : ' (dry run; pass --apply to write)'}"

def upsert(label, existing, apply)
  action = existing ? "update" : "create"
  puts "  #{action} #{label}"
  yield if apply
end

unless ARGV.include?("--android-only")
  Spaceship::ConnectAPI.token = Spaceship::ConnectAPI::Token.create(
    key_id: ENV.fetch("ASC_KEY_ID"), issuer_id: ENV.fetch("ASC_ISSUER_ID"), filepath: ENV.fetch("ASC_KEY_PATH")
  )
  app = Spaceship::ConnectAPI::App.find(APP_ID)
  app_info = app.fetch_edit_app_info or abort("No editable App Store app info")
  version = app.get_edit_app_store_version or abort("No editable App Store version")
  puts "iOS: app info #{app_info.state}, version #{version.version_string} #{version.app_store_state}"

  info_locs = app_info.get_app_info_localizations
  version_locs = version.get_app_store_version_localizations
  en_info = info_locs.find { |l| l.locale == "en-US" }
  en_version = version_locs.find { |l| l.locale == "en-US" }

  config.fetch("ios").each do |locale, key|
    copy = listings.fetch(key)
    info_attrs = { name: copy["name"], subtitle: copy["subtitle"], privacyPolicyUrl: en_info&.privacy_policy_url }.compact
    version_attrs = {
      description: copy["description"], keywords: copy["keywords"], whatsNew: copy["whatsNew"],
      supportUrl: en_version&.support_url, marketingUrl: en_version&.marketing_url
    }.compact

    info_loc = info_locs.find { |l| l.locale == locale }
    upsert("#{locale} app info", info_loc, APPLY) do
      if info_loc
        info_loc.update(attributes: info_attrs)
      else
        # Spaceship's create_app_info_localization sends an appStoreVersion relationship; ASC requires appInfo.
        Spaceship::ConnectAPI.tunes_request_client.post("v1/appInfoLocalizations", {
          data: {
            type: "appInfoLocalizations",
            attributes: info_attrs.merge(locale: locale),
            relationships: { appInfo: { data: { type: "appInfos", id: app_info.id } } }
          }
        })
      end
    end

    version_loc = version.get_app_store_version_localizations.find { |l| l.locale == locale }
    upsert("#{locale} version #{version.version_string}", version_loc, APPLY) do
      version_loc ? version_loc.update(attributes: version_attrs) : version.create_app_store_version_localization(attributes: version_attrs.merge(locale: locale))
    end
  end
end

unless ARGV.include?("--ios-only")
  service = Google::Apis::AndroidpublisherV3::AndroidPublisherService.new
  service.authorization = Google::Auth::ServiceAccountCredentials.make_creds(
    json_key_io: File.open(ENV.fetch("PLAY_STORE_JSON_KEY_PATH")),
    scope: "https://www.googleapis.com/auth/androidpublisher"
  )
  edit = service.insert_edit(APP_ID)
  begin
    existing = (service.list_edit_listings(APP_ID, edit.id).listings || []).map(&:language)
    puts "Android: existing listings #{existing.join(', ')}"
    config.fetch("android").each do |language, key|
      copy = listings.fetch(key)
      listing = Google::Apis::AndroidpublisherV3::Listing.new(
        language: language, title: copy["name"],
        short_description: copy["shortDescription"], full_description: copy["description"]
      )
      upsert("#{language} listing", existing.include?(language), APPLY) do
        service.update_edit_listing(APP_ID, edit.id, language, listing)
      end
    end
    if APPLY
      begin
        service.commit_edit(APP_ID, edit.id)
      rescue Google::Apis::ClientError => e
        abort("Android commit failed: #{e.body}")
      end
      edit = nil
      puts "Android: edit committed"
    end
  ensure
    service.delete_edit(APP_ID, edit.id) if edit
  end
end
