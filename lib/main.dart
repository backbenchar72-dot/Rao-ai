import 'package:flutter/material.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:flutter_tts/flutter_tts.dart';

void main() {
  runApp(const RaoAI());
}

class RaoAI extends StatelessWidget {
  const RaoAI({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'RAO AI',
      theme: ThemeData.dark(),
      home: const RaoHome(),
    );
  }
}

class RaoHome extends StatefulWidget {
  const RaoHome({super.key});

  @override
  State<RaoHome> createState() => _RaoHomeState();
}

class _RaoHomeState extends State<RaoHome> {
  final stt.SpeechToText speech = stt.SpeechToText();
  final FlutterTts tts = FlutterTts();

  String text = 'नमस्ते! मैं RAO AI हूँ 🤖';
  bool listening = false;

  Future<void> speak(String message) async {
    await tts.setLanguage('hi-IN');
    await tts.setSpeechRate(0.48);
    await tts.speak(message);
  }

  Future<void> startListening() async {
    final available = await speech.initialize();

    if (!available) {
      setState(() {
        text = 'Voice input उपलब्ध नहीं है 🎤';
      });
      return;
    }

    setState(() {
      listening = true;
      text = 'सुन रहा हूँ... 🎤';
    });

    await speech.listen(
      localeId: 'hi_IN',
      onResult: (result) {
        if (result.finalResult) {
          handleCommand(result.recognizedWords);
        }
      },
    );
  }

  Future<void> handleCommand(String command) async {
    final lower = command.toLowerCase();

    String reply;

    if (lower.contains('creator') ||
        lower.contains('क्रिएटर') ||
        lower.contains('निर्माता') ||
        lower.contains('नाम किसने')) {
      reply = 'RAO AI के Creator का नाम Suraj Kumar है।';
    } else if (lower.contains('good morning')) {
      reply = 'Good Morning! ☀️';
    } else if (lower.contains('नमस्ते') ||
        lower.contains('namaste')) {
      reply = 'नमस्ते! 👋 मैं RAO AI हूँ।';
    } else if (lower.contains('hello') ||
        lower.contains('हेलो')) {
      reply = 'Hello! 👋 मैं RAO AI हूँ।';
    } else if (lower.contains('तुम कौन') ||
        lower.contains('who are you')) {
      reply = 'मैं RAO AI हूँ, आपका AI assistant।';
    } else {
      reply = 'आपने कहा: $command';
    }

    setState(() {
      text = reply;
      listening = false;
    });

    await speech.stop();
    await speak(reply);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'RAO AI',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        centerTitle: true,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.smart_toy,
                size: 90,
              ),
              const SizedBox(height: 30),
              Text(
                text,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 45),
              GestureDetector(
                onTap: startListening,
                child: CircleAvatar(
                  radius: 42,
                  child: Icon(
                    listening ? Icons.mic : Icons.mic_none,
                    size: 40,
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                listening
                    ? 'बोलिए...'
                    : 'माइक दबाकर बोलिए',
                style: const TextStyle(fontSize: 16),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
