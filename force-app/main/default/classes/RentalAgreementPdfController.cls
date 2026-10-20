/**
 * Renders the RentalAgreementPdf Visualforce page to a PDF and saves it as a
 * File (ContentVersion) on the Opportunity. Each call creates a new dated
 * snapshot, so the Files list on the Opportunity doubles as a version history.
 *
 * The live, editable document is the rentalAgreementDoc LWC; this class only
 * produces point-in-time PDFs (e.g. the copy sent out for signing).
 */
public with sharing class RentalAgreementPdfController {

    @AuraEnabled
    public static Id generatePdf(Id opportunityId) {
        if (opportunityId == null) {
            throw buildException('An Opportunity Id is required to generate the agreement.');
        }

        try {
            // USER_MODE enforces record sharing and field-level security for the running user.
            Opportunity opp = [
                SELECT Id, Name
                FROM Opportunity
                WHERE Id = :opportunityId
                WITH USER_MODE
                LIMIT 1
            ];

            PageReference pdfPage = Page.RentalAgreementPdf;
            pdfPage.getParameters().put('id', opp.Id);

            // getContentAsPDF() is not supported in tests, and it must run before any DML.
            Blob pdfBody = Test.isRunningTest()
                ? Blob.valueOf('Test PDF body')
                : pdfPage.getContentAsPDF();

            String stamp = System.now().format('yyyyMMdd-HHmm');
            ContentVersion version = new ContentVersion(
                Title = ('Tenancy Agreement - ' + opp.Name + ' - ' + stamp).abbreviate(255),
                PathOnClient = 'Tenancy-Agreement-' + stamp + '.pdf',
                VersionData = pdfBody,
                FirstPublishLocationId = opp.Id
            );
            insert as user version;

            return [
                SELECT ContentDocumentId
                FROM ContentVersion
                WHERE Id = :version.Id
                WITH USER_MODE
            ].ContentDocumentId;
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw buildException(e.getMessage());
        }
    }

    // setMessage() makes the real text reach the LWC instead of "Script-thrown exception".
    private static AuraHandledException buildException(String message) {
        AuraHandledException ex = new AuraHandledException(message);
        ex.setMessage(message);
        return ex;
    }
}
