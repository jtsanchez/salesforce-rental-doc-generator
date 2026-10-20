@IsTest
private class RentalAgreementPdfControllerTest {

    private static Opportunity buildOpportunity(Decimal weeklyRent, Decimal bond, String state) {
        Account landlord = new Account(Name = 'Test Landlord Pty Ltd');
        insert landlord;
        return new Opportunity(
            Name = 'Test Tenancy',
            AccountId = landlord.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(7),
            Property_State__c = state,
            Weekly_Rent__c = weeklyRent,
            Bond_Amount__c = bond
        );
    }

    @IsTest
    static void generatePdfSavesFileOnOpportunity() {
        Opportunity opp = buildOpportunity(500, 2000, 'VIC');
        insert opp;

        Test.startTest();
        Id documentId = RentalAgreementPdfController.generatePdf(opp.Id);
        Test.stopTest();

        Assert.isNotNull(documentId, 'A ContentDocument Id should be returned');
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM ContentDocumentLink WHERE LinkedEntityId = :opp.Id AND ContentDocumentId = :documentId],
            'The PDF should be linked to the Opportunity'
        );
    }

    @IsTest
    static void generatePdfRequiresAnOpportunityId() {
        try {
            RentalAgreementPdfController.generatePdf(null);
            Assert.fail('Expected an AuraHandledException');
        } catch (AuraHandledException e) {
            Assert.isTrue(e.getMessage().contains('required'), 'Unexpected message: ' + e.getMessage());
        }
    }

    @IsTest
    static void vicBondAboveOneMonthsRentIsRejected() {
        // One month of $500/week rent is 500 x 52 / 12 = 2,166.67, so 2,500 is too high.
        Opportunity opp = buildOpportunity(500, 2500, 'VIC');

        Database.SaveResult result = Database.insert(opp, false);

        Assert.isFalse(result.isSuccess(), 'Bond above one month should fail the VIC validation rule');
        Assert.isTrue(
            result.getErrors()[0].getMessage().contains('one month'),
            'Unexpected message: ' + result.getErrors()[0].getMessage()
        );
    }

    @IsTest
    static void vicBondAtOneMonthsRentIsAllowed() {
        Opportunity opp = buildOpportunity(500, 2166, 'VIC');

        Database.SaveResult result = Database.insert(opp, false);

        Assert.isTrue(result.isSuccess(), 'Bond at or below one month should be allowed');
    }

    @IsTest
    static void vicHighRentPropertiesAreExemptFromTheCap() {
        // Rent above $900/week is outside the demo cap.
        Opportunity opp = buildOpportunity(1000, 6000, 'VIC');

        Database.SaveResult result = Database.insert(opp, false);

        Assert.isTrue(result.isSuccess(), 'Weekly rent above $900 should not be capped');
    }

    @IsTest
    static void bondCapDoesNotApplyOutsideVic() {
        Opportunity opp = buildOpportunity(500, 3000, 'QLD');

        Database.SaveResult result = Database.insert(opp, false);

        Assert.isTrue(result.isSuccess(), 'Demo rule should not apply to QLD');
    }

    @IsTest
    static void closedWonRequiresTenantAndStartDate() {
        Opportunity opp = buildOpportunity(500, 2000, 'VIC');
        opp.StageName = 'Closed Won';

        Database.SaveResult result = Database.insert(opp, false);

        Assert.isFalse(result.isSuccess(), 'Closed Won should require tenant name and start date');

        opp.Tenant_Name__c = 'Test Tenant';
        opp.Lease_Start_Date__c = Date.today().addDays(14);
        result = Database.insert(opp, false);

        Assert.isTrue(result.isSuccess(), 'Closed Won should succeed once tenant details are present');
    }
}
