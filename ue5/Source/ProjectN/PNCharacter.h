#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "PNCharacter.generated.h"

class UCameraComponent;
class UPNWeaponComponent;

/**
 * First-person player. UE equivalent of player.js — movement + camera come from
 * ACharacter's CharacterMovementComponent + a camera, so most of the hand-rolled
 * movement/collision code in the web game is replaced by the engine here.
 */
UCLASS()
class PROJECTN_API APNCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	APNCharacter();

	virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser) override;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float MaxHealth = 100.f;

	UPROPERTY(BlueprintReadOnly, Category = "Stats")
	float Health = 100.f;

protected:
	virtual void BeginPlay() override;
	virtual void SetupPlayerInputComponent(class UInputComponent* PlayerInputComponent) override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	UCameraComponent* Camera;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Weapon")
	UPNWeaponComponent* Weapon;

	void MoveForward(float Value);
	void MoveRight(float Value);
	void StartFire();
	void StopFire();
	void DoReload();
};
