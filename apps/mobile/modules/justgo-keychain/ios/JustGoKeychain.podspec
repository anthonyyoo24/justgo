Pod::Spec.new do |s|
  s.name = 'JustGoKeychain'
  s.version = '0.1.0'
  s.summary = 'JustGO credential storage'
  s.description = 'Synchronizable recovery credentials and independent per-installation device sessions.'
  s.license = { :type => 'MIT' }
  s.author = 'JustGO'
  s.homepage = 'https://github.com/anthonyyoo24/justgo'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
