Pod::Spec.new do |s|
  s.name = 'JustGoICloud'
  s.version = '0.1.0'
  s.summary = 'JustGO optional private CloudKit synchronization'
  s.description = 'Account-fenced, bounded collection synchronization through the user private CloudKit database.'
  s.license = { :type => 'MIT' }
  s.author = 'JustGO'
  s.homepage = 'https://github.com/anthonyyoo24/justgo'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CloudKit', 'CryptoKit'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
