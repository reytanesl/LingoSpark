Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0
$synth.Volume = 100

# Select native English voice
$synth.SelectVoice("Microsoft Zira Desktop")

$outputPath = "C:\Users\karol\Desktop\LingoSpark\shorts\vo_short18_english.wav"
$synth.SetOutputToWaveFile($outputPath)

$text = "Stop printing worksheets that end up in the bin! LingoSpark turns any word list into interactive classroom games in seconds. All vocabulary practice is one hundred percent free forever. Plus, AI writing tools help your students write better essays and exam emails. No app installs needed - it works on any browser, phone, or projector. Try it today at lingospark dot study!"

$synth.Speak($text)
$synth.Dispose()
Write-Host "Native English voiceover audio generated successfully using Microsoft Zira Desktop."
