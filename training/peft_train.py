import argparse
import json
import os

from datasets import Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
from peft import LoraConfig, get_peft_model


def load_feedback_dataset(path):
    with open(path, "r", encoding="utf-8") as f:
        records = json.load(f)
    # Expect records like {"prompt": ..., "completion": ..., "adopted": true}
    data = [r for r in records if r.get("prompt") and r.get("completion")]
    return Dataset.from_list(data)


def compute_adoption_rate(records):
    if not records:
        return 0.0
    adopted = sum(1 for r in records if r.get("adopted"))
    return adopted / len(records)


def main():
    parser = argparse.ArgumentParser(description="Fine-tune model with LoRA")
    parser.add_argument("dataset", help="Path to curated feedback dataset")
    parser.add_argument("model", help="Base model name")
    parser.add_argument("output", help="Directory to save LoRA adapter")
    args = parser.parse_args()

    ds = load_feedback_dataset(args.dataset)
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForCausalLM.from_pretrained(args.model)

    lora = LoraConfig(task_type="CAUSAL_LM", r=16, lora_alpha=32, lora_dropout=0.05)
    model = get_peft_model(model, lora)

    def tokenize(example):
        return tokenizer(example["prompt"], text_target=example["completion"], truncation=True)

    tokenized = ds.map(tokenize)

    training_args = TrainingArguments(
        output_dir=args.output,
        per_device_train_batch_size=2,
        num_train_epochs=1,
        logging_steps=10,
        save_steps=50,
    )

    trainer = Trainer(model=model, args=training_args, train_dataset=tokenized)
    trainer.train()
    os.makedirs(args.output, exist_ok=True)
    model.save_pretrained(args.output)

    rate = compute_adoption_rate(ds)
    print(f"Base adoption rate: {rate:.2%}")


if __name__ == "__main__":
    main()
