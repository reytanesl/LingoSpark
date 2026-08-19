Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0
$synth.Volume = 95
$synth.SelectVoice("Microsoft Hazel Desktop")
$outputPath = "C:\Users\karol\Desktop\LingoSpark\shorts\vo_frankenstein_howto.wav"
$synth.SetOutputToWaveFile($outputPath)
$text = @"
Ready for something fun? Let's play Frankenstein Builder!
First, you'll love this essay structure: Hook, Context, Thesis, Evidence, Analysis — nice and clear.
The AI gives you five bright little sentences… but they're playfully scrambled. That's part of the game!
Use the up and down arrows to move each sentence — you've got this!
Keep rearranging until the paragraph sings.
Then tap Check Order — exciting moment!
When you're correct, that lovely academic flow unlocks. Brilliant!
Come and try it now at lingospark.study — you'll enjoy it!
"@
$synth.Speak($text)
$synth.Dispose()
Write-Host "Joyous British Hazel VO done: $outputPath"
