#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "PNEnemyCharacter.generated.h"

/**
 * Melee enemy. UE equivalent of the enemy AI in world.js: walk toward the
 * player, and once inside MeleeRange, deal MeleeDamage on a cooldown. This
 * scaffold steers directly in Tick() for simplicity; for production replace it
 * with an AIController + Behavior Tree + NavMesh (see the README / migration
 * report).
 */
UCLASS()
class PROJECTN_API APNEnemyCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	APNEnemyCharacter();

	virtual void Tick(float DeltaSeconds) override;
	virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser) override;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float MaxHealth = 60.f;

	UPROPERTY(BlueprintReadOnly, Category = "Stats")
	float Health = 60.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
	float MeleeRange = 180.f; // cm

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
	float MeleeDamage = 8.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
	float AttackCooldown = 0.7f;

protected:
	virtual void BeginPlay() override;
	float LastAttackTime = -1000.f;
};
