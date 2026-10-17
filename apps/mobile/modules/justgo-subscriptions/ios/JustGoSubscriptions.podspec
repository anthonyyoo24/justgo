Pod::Spec.new do |s|
  s.name = 'JustGoSubscriptions'
  s.version = '0.1.0'
  s.summary = 'JustGO Apple subscription management'
  s.description = 'Presents Apple subscription controls for the current App Store customer.'
  s.license = { :type => 'MIT' }
  s.author = 'JustGO'
  s.homepage = 'https://github.com/anthonyyoo24/justgo'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'StoreKit', 'UIKit'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
